const INTERNATIONAL_WHATSAPP_PHONE_PATTERN = /^[1-9]\d{7,14}$/;

export const normalizeWhatsAppPhoneNumber = (value: unknown) => {
 if (typeof value !== 'string') return undefined;

 const text = value.trim().slice(0, 32).replace(/[\s()-]/g, '');
 const normalized = text.startsWith('+') ? text.slice(1) : text;

 if (!INTERNATIONAL_WHATSAPP_PHONE_PATTERN.test(normalized)) {
 return undefined;
 }

 return normalized;
};
