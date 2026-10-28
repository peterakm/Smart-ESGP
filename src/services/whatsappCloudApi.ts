import type { ChatbotReply, WhatsAppSendRequest, WhatsAppSendResult } from '../contracts/whatsapp';

export interface WhatsAppCloudApiConfig {
 graphApiVersion: string;
 accessToken?: string;
 phoneNumberId?: string;
 requestTimeoutMs: number;
}

export interface WhatsAppCloudApiConfigSummary {
 mode: 'live' | 'dry_run';
 graphApiVersion: string;
 graphApiVersionValid: boolean;
 accessTokenConfigured: boolean;
 phoneNumberIdConfigured: boolean;
 phoneNumberIdValid: boolean;
 requestTimeoutMs: number;
 requestTimeoutValid: boolean;
}

export const DEFAULT_GRAPH_API_VERSION = 'v23.0';
export const DEFAULT_WHATSAPP_REQUEST_TIMEOUT_MS = 10000;
const GRAPH_API_VERSION_PATTERN = /^v\d+\.\d+$/;
const PHONE_NUMBER_ID_PATTERN = /^\d{6,32}$/;
const MIN_WHATSAPP_REQUEST_TIMEOUT_MS = 1000;
const MAX_WHATSAPP_REQUEST_TIMEOUT_MS = 60000;

export const resolveWhatsAppRequestTimeoutMs = (value: string | undefined) => {
 if (!value || value.trim().length === 0) {
 return {
 ok: true,
 ms: DEFAULT_WHATSAPP_REQUEST_TIMEOUT_MS,
 };
 }

 const ms = Number(value);
 if (!Number.isInteger(ms) || ms < MIN_WHATSAPP_REQUEST_TIMEOUT_MS || ms > MAX_WHATSAPP_REQUEST_TIMEOUT_MS) {
 return {
 ok: false,
 ms: DEFAULT_WHATSAPP_REQUEST_TIMEOUT_MS,
 message: `WHATSAPP_REQUEST_TIMEOUT_MS must be an integer between ${MIN_WHATSAPP_REQUEST_TIMEOUT_MS} and ${MAX_WHATSAPP_REQUEST_TIMEOUT_MS}.`,
 };
 }

 return {
 ok: true,
 ms,
 };
};

export const createWhatsAppCloudApiConfig = (env: NodeJS.ProcessEnv): WhatsAppCloudApiConfig => {
 const timeout = resolveWhatsAppRequestTimeoutMs(env.WHATSAPP_REQUEST_TIMEOUT_MS);

 return {
 graphApiVersion: env.WHATSAPP_GRAPH_API_VERSION || DEFAULT_GRAPH_API_VERSION,
 accessToken: env.WHATSAPP_ACCESS_TOKEN,
 phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
 requestTimeoutMs: timeout.ms,
 };
};

export const summarizeWhatsAppCloudApiConfig = (
 config: WhatsAppCloudApiConfig
): WhatsAppCloudApiConfigSummary => {
 const accessTokenConfigured = !!config.accessToken?.trim();
 const phoneNumberId = config.phoneNumberId?.trim() || '';
 const phoneNumberIdConfigured = phoneNumberId.length > 0;

 return {
 mode: accessTokenConfigured && phoneNumberIdConfigured ? 'live' : 'dry_run',
 graphApiVersion: config.graphApiVersion,
 graphApiVersionValid: GRAPH_API_VERSION_PATTERN.test(config.graphApiVersion),
 accessTokenConfigured,
 phoneNumberIdConfigured,
 phoneNumberIdValid: !phoneNumberIdConfigured || PHONE_NUMBER_ID_PATTERN.test(phoneNumberId),
 requestTimeoutMs: config.requestTimeoutMs,
 requestTimeoutValid: Number.isInteger(config.requestTimeoutMs)
 && config.requestTimeoutMs >= MIN_WHATSAPP_REQUEST_TIMEOUT_MS
 && config.requestTimeoutMs <= MAX_WHATSAPP_REQUEST_TIMEOUT_MS,
 };
};

const extractProviderMessageId = (value: unknown) => {
 if (!value || typeof value !== 'object') return undefined;
 const data = value as { messages?: Array<{ id?: unknown }> };
 const id = data.messages?.[0]?.id;
 return typeof id === 'string' ? id : undefined;
};

const parseJsonSafely = (value: string) => {
 if (!value) return undefined;

 try {
 return JSON.parse(value) as unknown;
 } catch {
 return undefined;
 }
};

const summarizeSendError = (errorValue: unknown) => {
 if (errorValue instanceof Error && errorValue.name === 'AbortError') {
 return 'WhatsApp Cloud API request timed out.';
 }

 if (errorValue instanceof Error) {
 return errorValue.message.slice(0, 500);
 }

 return 'WhatsApp Cloud API request failed.';
};

export const sendWhatsAppTextMessage = async (
 config: WhatsAppCloudApiConfig,
 request: WhatsAppSendRequest
): Promise<WhatsAppSendResult> => {
 const sentAt = new Date().toISOString();

 if (!config.accessToken || !config.phoneNumberId) {
 return {
 ...request,
 mode: 'dry_run',
 sentAt,
 };
 }

 const controller = new AbortController();
 const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
 let response: Response;

 try {
 response = await fetch(
 `https://graph.facebook.com/${encodeURIComponent(config.graphApiVersion)}/${encodeURIComponent(config.phoneNumberId)}/messages`,
 {
 method: 'POST',
 headers: {
 authorization: `Bearer ${config.accessToken}`,
 'content-type': 'application/json',
 },
 body: JSON.stringify({
 messaging_product: 'whatsapp',
 recipient_type: 'individual',
 to: request.toPhone,
 type: 'text',
 text: {
 preview_url: false,
 body: request.text,
 },
 }),
 signal: controller.signal,
 }
 );
 } catch (sendError) {
 return {
 ...request,
 mode: 'failed',
 error: summarizeSendError(sendError),
 sentAt,
 };
 } finally {
 clearTimeout(timeout);
 }

 const responseText = await response.text();
 const parsedResponse = parseJsonSafely(responseText);

 if (!response.ok) {
 return {
 ...request,
 mode: 'failed',
 statusCode: response.status,
 error: responseText.slice(0, 500),
 sentAt,
 };
 }

 return {
 ...request,
 mode: 'sent',
 statusCode: response.status,
 providerMessageId: extractProviderMessageId(parsedResponse),
 sentAt,
 };
};

export const sendChatbotReply = (
 config: WhatsAppCloudApiConfig,
 reply: ChatbotReply
) => {
 return sendWhatsAppTextMessage(config, {
 toPhone: reply.toPhone,
 text: reply.text,
 });
};
