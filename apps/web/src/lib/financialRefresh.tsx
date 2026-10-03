import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { connectLabSocket } from './labSocket';

const eventName = 'labflow:financial-change';
export function notifyFinancialChange(invoiceId?:string) {
  window.dispatchEvent(new CustomEvent(eventName,{detail:{invoiceId}}));
}

/** Refresh hints only. Financial authorization always belongs to PostgreSQL. */
export function FinancialLiveRefresh() {
  const {user} = useAuth();
  useEffect(()=>{
    if (!user) return;
    const socket = connectLabSocket();
    socket.on('invoice:changed',({invoiceId}:{invoiceId:string})=>notifyFinancialChange(invoiceId));
    socket.on('connect',()=>notifyFinancialChange()); // Refresh after missed events/reconnect.
    return ()=>{socket.disconnect();};
  },[user?.userId]);
  return null;
}

export function useFinancialRefresh(refresh:()=>void, invoiceId?:string) {
  const latest = useRef(refresh); latest.current=refresh;
  useEffect(()=>{
    const listener = (event:Event)=>{
      const changed = (event as CustomEvent<{invoiceId?:string}>).detail?.invoiceId;
      if (!invoiceId || !changed || changed===invoiceId) latest.current();
    };
    const focus = ()=>latest.current();
    window.addEventListener(eventName,listener);
    window.addEventListener('focus',focus);
    return ()=>{window.removeEventListener(eventName,listener);window.removeEventListener('focus',focus);};
  },[invoiceId]);
}
