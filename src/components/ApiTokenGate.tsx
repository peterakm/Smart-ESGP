import { useState, type FormEvent } from 'react';
import { apiFetch, saveApiToken } from '../api/client';
import { SmartEsgpMark } from './SmartEsgpMark';

const GATE_COPY = {
 EN: {
 eyebrow: 'Access required',
 title: 'Enter your access token',
 body: 'The Smart-ESGP server rejected this browser because no valid access token is saved. Paste the token your administrator gave you to open the workspace.',
 label: 'Access token',
 submit: 'Open workspace',
 checking: 'Checking...',
 rejected: 'That token was not accepted. Check it and try again.',
 unreachable: 'Could not reach the server. Check that it is running and try again.',
 note: 'The token is saved in this browser only.',
 },
 BM: {
 eyebrow: 'Akses diperlukan',
 title: 'Masukkan token akses anda',
 body: 'Pelayan Smart-ESGP menolak pelayar ini kerana tiada token akses yang sah disimpan. Tampal token yang diberikan oleh pentadbir anda untuk membuka ruang kerja.',
 label: 'Token akses',
 submit: 'Buka ruang kerja',
 checking: 'Menyemak...',
 rejected: 'Token itu tidak diterima. Semak dan cuba lagi.',
 unreachable: 'Tidak dapat menghubungi pelayan. Pastikan ia sedang berjalan dan cuba lagi.',
 note: 'Token disimpan dalam pelayar ini sahaja.',
 },
} as const;

interface ApiTokenGateProps {
 language: keyof typeof GATE_COPY;
}

export const ApiTokenGate = ({ language }: ApiTokenGateProps) => {
 const copy = GATE_COPY[language];
 const [token, setToken] = useState('');
 const [status, setStatus] = useState<'idle' | 'checking' | 'rejected' | 'unreachable'>('idle');

 const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
 event.preventDefault();
 if (!token.trim()) return;

 setStatus('checking');
 saveApiToken(token);

 try {
 const response = await apiFetch('/api/audit/events?limit=1');
 if (response.status === 401) {
 setStatus('rejected');
 return;
 }
 // Reload so every panel refetches with the new token.
 window.location.reload();
 } catch {
 setStatus('unreachable');
 }
 };

 return (
 <main className="min-h-screen bg-[#f3f6f8] text-slate-900 font-sans selection:bg-emerald-700 selection:text-white grid place-items-center px-4 py-10">
 <section className="w-full max-w-xl rounded-2xl border border-emerald-100 bg-white p-8 shadow-xl shadow-emerald-950/8">
 <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-emerald-100 bg-white p-1.5 shadow-sm">
 <SmartEsgpMark className="h-full w-full object-contain" />
 </div>
 <p className="mt-8 text-xs font-semibold text-emerald-700">{copy.eyebrow}</p>
 <h1 className="mt-2 type-page-title text-slate-950">{copy.title}</h1>
 <p className="mt-3 text-sm leading-6 text-slate-600">{copy.body}</p>

 <form className="mt-7" onSubmit={handleSubmit} id="api-token-form">
 <label htmlFor="api-token-input" className="block text-xs font-semibold text-slate-700">
 {copy.label}
 </label>
 <input
 id="api-token-input"
 type="password"
 autoComplete="off"
 autoFocus
 value={token}
 onChange={(event) => {
 setToken(event.target.value);
 if (status !== 'checking') setStatus('idle');
 }}
 aria-invalid={status === 'rejected'}
 aria-describedby="api-token-status"
 className="mt-2 block h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-400"
 />
 <p id="api-token-status" role="status" className={`mt-2 min-h-5 text-xs ${status === 'rejected' || status === 'unreachable' ? 'text-rose-700' : 'text-slate-500'}`}>
 {status === 'rejected' ? copy.rejected : status === 'unreachable' ? copy.unreachable : copy.note}
 </p>
 <button
 type="submit"
 disabled={status === 'checking' || !token.trim()}
 className="mt-5 inline-flex min-h-11 items-center rounded-full bg-emerald-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
 id="btn-api-token-submit"
 >
 {status === 'checking' ? copy.checking : copy.submit}
 </button>
 </form>
 </section>
 </main>
 );
};
