const API_TOKEN_STORAGE_KEY = 'smartEsgpApiToken';

const getApiToken = () => {
 if (typeof window === 'undefined') return undefined;
 return window.localStorage.getItem(API_TOKEN_STORAGE_KEY) || undefined;
};

export const saveApiToken = (token: string) => {
 window.localStorage.setItem(API_TOKEN_STORAGE_KEY, token.trim());
};

export const apiFetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
 const headers = new Headers(init.headers);
 const token = getApiToken();

 if (token && !headers.has('authorization')) {
 headers.set('authorization', `Bearer ${token}`);
 }

 return fetch(input, {
 ...init,
 headers,
 });
};
