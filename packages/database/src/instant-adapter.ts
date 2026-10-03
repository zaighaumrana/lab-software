import { PrismaPg } from '@prisma/adapter-pg';
import { types, type Pool, type QueryConfig } from 'pg';

type Adapter = Awaited<ReturnType<PrismaPg['connect']>>;
type Transaction = Awaited<ReturnType<Adapter['startTransaction']>>;
type Query = Parameters<Adapter['queryRaw']>[0];

/** PrismaPg 7.10 drops offsets from datetime inputs and timestamptz outputs.
 * Upstream: https://github.com/prisma/prisma/issues/28629 (binding) and
 * https://github.com/prisma/prisma/issues/26786 (non-UTC adapter behavior).
 * Correct only instant bindings/parsing, without changing session TimeZone or legacy TIMESTAMP defaults.
 * Uses the adapter's existing owned pool and pg's documented parser/connect APIs.
 * Reevaluate on every Prisma/client/adapter upgrade beyond pinned 7.10.0.
 * Remove only after the unwrapped adapter passes our UTC/Karachi regressions,
 * including native UTC storage, DB defaults and legacy wall timestamps.
 * Phase A uses scalar instants: arrays/binary parsing are intentionally untouched.
 */
export class InstantSafePrismaPg extends PrismaPg {
  override async connect(): ReturnType<PrismaPg['connect']> {
    const adapter = await super.connect();
    installInstantParser(adapter.underlyingDriver());
    preserveInstantBindings(adapter);
    const start = adapter.startTransaction.bind(adapter);
    adapter.startTransaction = async isolation => {
      const transaction = await start(isolation);
      preserveInstantBindings(transaction);
      return transaction;
    };
    return adapter;
  }
}

function instantQuery(query: Query): Query {
  const argTypes = query.argTypes.map(type => ({ ...type }));
  const args = query.args.map((value, i) => {
    const type = argTypes[i];
    if (value !== null && type.arity !== 'list' && type.scalarType === 'datetime' &&
      (type.dbType?.toUpperCase().startsWith('TIMESTAMPTZ') || type.dbType === undefined)) {
      // String bindings bypass the adapter's timezone-free datetime formatter.
      // Undefined dbType is a raw-query Date parameter; explicit TIMESTAMP is untouched.
      type.scalarType = 'string';
      return (value instanceof Date ? value : new Date(value as string)).toISOString();
    }
    return value;
  });
  return { ...query, args, argTypes };
}

function preserveInstantBindings(adapter: Adapter | Transaction) {
  const read = adapter.queryRaw.bind(adapter), write = adapter.executeRaw.bind(adapter);
  adapter.queryRaw = query => read(instantQuery(query));
  adapter.executeRaw = query => write(instantQuery(query));
}

function installInstantParser(pool: Pool) {
  pool.on('connect', client => {
    const original = client.query;
    // Override only scalar timestamptz text parsing. Leave adapter parsers for
    // legacy timestamp, Decimal, JSON and all other types intact.
    client.query = ((...args: unknown[]) => {
      const first = args[0];
      if (first && typeof first === 'object' && 'text' in first) {
        const config = first as QueryConfig;
        const previous = config.types;
        args[0] = { ...config, types: {
          getTypeParser(oid: number, format?: 'text' | 'binary') {
            if (oid === 1184 && format !== 'binary') return (value: string) => new Date(value).toISOString();
            return (previous ?? types).getTypeParser(oid, format);
          },
        } };
      }
      return Reflect.apply(original, client, args);
    }) as typeof client.query;
  });
}
