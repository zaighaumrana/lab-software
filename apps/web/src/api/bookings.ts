import { api } from './client';
import type { Booking } from '../types';

export async function createBooking(payload: {
  patientId: string;
  doctorId?: string;
  source?: string;
  notes?: string;
}) {
  const { data } = await api.post<Booking>('/bookings', payload);
  return data;
}

export async function getBooking(id: string) {
  const { data } = await api.get<Booking>(`/bookings/${id}`);
  return data;
}

export async function getBookingByCode(code: string) {
  const { data } = await api.get<Booking>(`/bookings/code/${code}`);
  return data;
}

export async function checkInBooking(id: string) {
  const { data } = await api.patch<Booking>(`/bookings/${id}/check-in`, {});
  return data;
}
