import type { ConsentRecord, EvidenceRecord, Farmer, Waypoint } from '../types';
import type {
 ChatbotIntent,
 ChatbotReply,
 WhatsAppDeliveryStatus,
 WhatsAppDeliveryStatusError,
 WhatsAppDeliveryStatusValue,
 WhatsAppFarmerSession,
 WhatsAppInboundMessage,
 WhatsAppLocationPayload,
 WhatsAppOnboardingStep,
 WhatsAppSurveyResponse,
 WhatsAppWebhookEvent,
 WhatsAppWebhookResult,
} from '../contracts/whatsapp';
import { evaluateFarmerCompliance } from './complianceEngine';
import { buildCaseGuidanceText, buildComplianceQuestionReply, buildDailyCheckInFeedback } from './farmerFeedback';
import { evaluateEvidenceLocation } from './geofence';
import { normalizeWhatsAppPhoneNumber } from './whatsappPhone';

const CONSENT_VERSION = 'pdpa-ms-eudr-v1';

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
 return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
};

const asString = (value: unknown) => {
 return typeof value === 'string' ? value : undefined;
};

const asNumber = (value: unknown) => {
 return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

const getTextBody = (message: Record<string, unknown>) => {
 const text = asRecord(message.text);
 return asString(text?.body);
};

const getMedia = (message: Record<string, unknown>) => {
 const image = asRecord(message.image);
 const voice = asRecord(message.voice);
 const media = image || voice;

 return {
 id: asString(media?.id),
 mimeType: asString(media?.mime_type),
 caption: asString(media?.caption),
 };
};

const getLocation = (message: Record<string, unknown>): WhatsAppLocationPayload | undefined => {
 const location = asRecord(message.location);
 const lat = asNumber(location?.latitude);
 const lng = asNumber(location?.longitude);

 if (lat === undefined || lng === undefined) {
 return undefined;
 }

 return {
 lat,
 lng,
 name: asString(location?.name),
 address: asString(location?.address),
 };
};

export interface WhatsAppCloudWebhookParseResult {
 inboundMessages: WhatsAppInboundMessage[];
 deliveryStatuses: WhatsAppDeliveryStatus[];
 ignoredCount: number;
}

const normalizeDeliveryStatusValue = (value: string | undefined): WhatsAppDeliveryStatusValue => {
 if (value === 'sent' || value === 'delivered' || value === 'read' || value === 'failed' || value === 'deleted') {
 return value;
 }

 return 'unknown';
};

const getStatusTimestamp = (status: Record<string, unknown>) => {
 const timestampSeconds = Number(asString(status.timestamp));
 return Number.isFinite(timestampSeconds)
 ? new Date(timestampSeconds * 1000).toISOString()
 : new Date().toISOString();
};

const parseStatusErrors = (status: Record<string, unknown>): WhatsAppDeliveryStatusError[] | undefined => {
 const errors = Array.isArray(status.errors) ? status.errors : [];
 const parsedErrors = errors
 .map(asRecord)
 .filter(Boolean)
 .map((error) => ({
 code: asString(error?.code),
 title: asString(error?.title),
 message: asString(error?.message) || asString(error?.error_data && asRecord(error.error_data)?.details),
 }))
 .filter((error) => error.code || error.title || error.message);

 return parsedErrors.length > 0 ? parsedErrors : undefined;
};

const parseDeliveryStatus = (rawStatus: unknown): WhatsAppDeliveryStatus | undefined => {
 const status = asRecord(rawStatus);
 if (!status) return undefined;

 const providerMessageId = asString(status.id);
 if (!providerMessageId) return undefined;

 const conversation = asRecord(status.conversation);
 const pricing = asRecord(status.pricing);

 return {
 provider: 'whatsapp-cloud-api',
 providerMessageId,
 status: normalizeDeliveryStatusValue(asString(status.status)),
 recipientPhone: normalizeWhatsAppPhoneNumber(status.recipient_id),
 conversationId: asString(conversation?.id),
 pricingCategory: asString(pricing?.category),
 updatedAt: getStatusTimestamp(status),
 errors: parseStatusErrors(status),
 };
};

export const parseWhatsAppCloudWebhookPayload = (body: unknown): WhatsAppCloudWebhookParseResult => {
 const root = asRecord(body);
 const entries = Array.isArray(root?.entry) ? root.entry : [];
 const inbound: WhatsAppInboundMessage[] = [];
 const deliveryStatuses: WhatsAppDeliveryStatus[] = [];
 let ignoredCount = 0;

 for (const entry of entries) {
 const entryRecord = asRecord(entry);
 const changes = Array.isArray(entryRecord?.changes) ? entryRecord.changes : [];

 for (const change of changes) {
 const changeRecord = asRecord(change);
 const value = asRecord(changeRecord?.value);
 const messages = Array.isArray(value?.messages) ? value.messages : [];
 const statuses = Array.isArray(value?.statuses) ? value.statuses : [];

 for (const rawStatus of statuses) {
 const deliveryStatus = parseDeliveryStatus(rawStatus);
 if (!deliveryStatus) {
 ignoredCount += 1;
 continue;
 }

 deliveryStatuses.push(deliveryStatus);
 }

 for (const rawMessage of messages) {
 const message = asRecord(rawMessage);
 if (!message) {
 ignoredCount += 1;
 continue;
 }

 const type = asString(message.type);
 const providerMessageId = asString(message.id);
 const fromPhone = normalizeWhatsAppPhoneNumber(message.from);
 if (!providerMessageId || !fromPhone) {
 ignoredCount += 1;
 continue;
 }

 const timestampSeconds = Number(asString(message.timestamp));
 const receivedAt = Number.isFinite(timestampSeconds)
 ? new Date(timestampSeconds * 1000).toISOString()
 : new Date().toISOString();

 if (type === 'text') {
 inbound.push({
 provider: 'whatsapp-cloud-api',
 providerMessageId,
 fromPhone,
 receivedAt,
 kind: 'text',
 text: getTextBody(message),
 raw: rawMessage,
 });
 continue;
 }

 if (type === 'image' || type === 'voice') {
 const media = getMedia(message);
 inbound.push({
 provider: 'whatsapp-cloud-api',
 providerMessageId,
 fromPhone,
 receivedAt,
 kind: type,
 text: media.caption,
 mediaId: media.id,
 mimeType: media.mimeType,
 raw: rawMessage,
 });
 continue;
 }

 if (type === 'location') {
 inbound.push({
 provider: 'whatsapp-cloud-api',
 providerMessageId,
 fromPhone,
 receivedAt,
 kind: 'location',
 location: getLocation(message),
 raw: rawMessage,
 });
 continue;
 }

 inbound.push({
 provider: 'whatsapp-cloud-api',
 providerMessageId,
 fromPhone,
 receivedAt,
 kind: 'unknown',
 raw: rawMessage,
 });
 }
 }
 }

 return {
 inboundMessages: inbound,
 deliveryStatuses,
 ignoredCount,
 };
};

export const parseWhatsAppCloudWebhook = (body: unknown): WhatsAppInboundMessage[] => {
 return parseWhatsAppCloudWebhookPayload(body).inboundMessages;
};

const findFarmerByMpoBLicence = (farmersById: Map<string, Farmer>, text?: string) => {
 if (!text || !/^\d{6}$/.test(text.trim())) {
 return undefined;
 }

 const licence = text.trim();
 return [...farmersById.values()].find((farmer) => farmer.mpobLicence === licence);
};

const findLinkedSessionForFarmer = (
 sessionsByPhone: Map<string, WhatsAppFarmerSession>,
 farmerId: string,
 excludePhoneNumber: string
) => {
 return [...sessionsByPhone.values()].find((session) =>
 session.phoneNumber !== excludePhoneNumber && session.farmerId === farmerId
 );
};

const firstName = (name: string) => name.split(' ')[0] || 'Tani';

const createSession = (phoneNumber: string, now: string): WhatsAppFarmerSession => ({
 phoneNumber,
 step: 'language',
 identityStatus: 'unlinked',
 createdAt: now,
 updatedAt: now,
});

const withSessionStep = (
 reply: Omit<ChatbotReply, 'toPhone' | 'sessionStep'>,
 inbound: WhatsAppInboundMessage,
 step: WhatsAppOnboardingStep
): ChatbotReply => ({
 ...reply,
 toPhone: inbound.fromPhone,
 sessionStep: step,
});

const consentText = (language: 'BM' | 'EN') => {
 return language === 'EN'
 ? "Consent notice: Smart-ESGP will collect your WhatsApp number, location, farm photos, and activity records for MSPO/EUDR review. Reply I AGREE to continue."
 : "Notis persetujuan: Smart-ESGP akan mengumpul nombor WhatsApp, lokasi, gambar kebun, dan rekod aktiviti untuk semakan MSPO/EUDR. Balas SAYA SETUJU untuk teruskan.";
};

const languagePrompt =
 "Selamat datang ke Smart-ESGP. Balas BM untuk Bahasa Melayu. Reply EN for English.";

// Farmers often type from a phone keyboard with autocorrect/auto-punctuation
// (e.g. "En.", "En", "i agree!"), so exact-choice matching strips trailing
// punctuation on top of the case-insensitive upperText already passed in.
const normalizeExactChoice = (text?: string) => text?.trim().replace(/[.!?,;:]+$/g, '');

const isLanguageChoice = (text?: string): text is 'BM' | 'EN' => {
 const normalized = normalizeExactChoice(text);
 return normalized === 'BM' || normalized === 'EN';
};

const isConsentChoice = (text?: string) => {
 const normalized = normalizeExactChoice(text);
 return normalized === 'I AGREE' || normalized === 'SAYA SETUJU';
};

const detectActivityFromText = (text?: string): Waypoint['activity'] | undefined => {
 const upperText = text?.toUpperCase() || '';
 if (upperText.includes('HARVEST') || upperText.includes('TUAI') || upperText.includes('MENUAI')) return 'harvest';
 if (upperText.includes('PRUNE') || upperText.includes('CANTAS')) return 'prune';
 if (upperText.includes('SPRAY') || upperText.includes('RACUN') || upperText.includes('SEMBUR')) return 'spray';
 if (upperText.includes('WEED') || upperText.includes('MERUMPUT')) return 'weed';
 if (upperText.includes('INSPECT') || upperText.includes('CHECK') || upperText.includes('SEMAK') || upperText.includes('PERIKSA')) return 'inspect';
 return undefined;
};

const getActivityFromText = (text?: string, fallback: Waypoint['activity'] = 'inspect'): Waypoint['activity'] => {
 return detectActivityFromText(text) || fallback;
};

const getActivitySource = (
 inbound: WhatsAppInboundMessage,
 session: WhatsAppFarmerSession
): NonNullable<EvidenceRecord['intake']>['activitySource'] => {
 if (detectActivityFromText(inbound.text)) {
 return 'caption';
 }

 if (session.pendingActivity) {
 return 'pending_session';
 }

 return 'default';
};

// Activity is a free string on the session; fall back to a generic word
// rather than throwing on an unexpected or missing value.
const activityLabel = (activity: Waypoint['activity'], language: 'BM' | 'EN') => {
 const labels: Record<string, { BM: string; EN: string }> = {
 harvest: { BM: 'tuai', EN: 'harvest' },
 prune: { BM: 'cantas', EN: 'prune' },
 spray: { BM: 'sembur/racun', EN: 'spray' },
 weed: { BM: 'merumput', EN: 'weed' },
 inspect: { BM: 'semakan kebun', EN: 'farm inspection' },
 };

 return labels[activity ?? '']?.[language] ?? (language === 'EN' ? 'farm activity' : 'aktiviti kebun');
};

const activityQuestion = (language: 'BM' | 'EN') => {
 return language === 'EN'
 ? 'What did you do on the farm today? Reply harvest, prune, spray, weed, or inspect, or send the photo with one of those words as its caption.'
 : 'Apa aktiviti kebun anda hari ini? Balas tuai, cantas, sembur, merumput, atau semak, atau hantar gambar dengan salah satu perkataan itu sebagai kapsyen.';
};

interface InboundProcessingResult {
 reply: ChatbotReply;
 session: WhatsAppFarmerSession;
 farmerUpdate?: Farmer;
 evidenceRecord?: EvidenceRecord;
 consentRecord?: ConsentRecord;
 surveyResponse?: WhatsAppSurveyResponse;
}

const buildEvidenceRecord = (
 farmer: Farmer,
 inbound: WhatsAppInboundMessage,
 session: WhatsAppFarmerSession
): EvidenceRecord => {
 const activity = getActivityFromText(inbound.text, session.pendingActivity || 'inspect');
 const location = session.pendingLocation;
 const createdAt = new Date().toISOString();
 const activitySource = getActivitySource(inbound, session);
 const locationValidation = evaluateEvidenceLocation(
 location ? { lat: location.lat, lng: location.lng } : undefined,
 farmer.polygonWaypoints,
 createdAt
 );
 const verificationStatus = locationValidation.status === 'inside_plot' ? 'received' : 'needs_review';
 const locationSummary = location
 ? `GPS (${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}) ${locationValidation.status.replace(/_/g, ' ')}.`
 : 'No GPS location was available.';

 return {
 id: `ev-${inbound.providerMessageId}`,
 farmerId: farmer.id,
 source: 'whatsapp',
 evidenceType: 'daily_checkin',
 activityType: activity as keyof Farmer['evidenceSummary']['activities'],
 verificationStatus,
 phoneNumber: inbound.fromPhone,
 providerMessageId: inbound.providerMessageId,
 mediaId: inbound.mediaId,
 mimeType: inbound.mimeType,
 location: location ? { lat: location.lat, lng: location.lng } : undefined,
 receivedAt: inbound.receivedAt,
 createdAt,
 summary: location
 ? `${activity} evidence received with WhatsApp image and ${locationSummary}`
 : `${activity} evidence received with WhatsApp image but no GPS location.`,
 intake: {
 channel: 'whatsapp',
 provider: inbound.provider,
 providerMessageId: inbound.providerMessageId,
 receivedMessageKind: inbound.kind,
 language: session.language,
 sessionStep: session.step,
 activitySource,
 collectedAt: createdAt,
 completeness: {
 linkedFarmer: !!session.farmerId,
 hasConsent: !!session.consentedAt,
 hasLocation: !!location,
 hasMedia: !!inbound.mediaId,
 hasActivity: activitySource !== 'default',
 },
 },
 locationValidation,
 review: {
 status: 'pending',
 notes: locationValidation.status === 'inside_plot'
 ? undefined
 : locationValidation.reason || 'Location requires FELDA review.',
 },
 };
};

const buildConsentRecord = (
 inbound: WhatsAppInboundMessage,
 session: WhatsAppFarmerSession,
 responseText: string,
 consentedAt: string
): ConsentRecord => {
 const language = session.language || 'BM';

 return {
 id: `consent-${inbound.providerMessageId}`,
 phoneNumber: inbound.fromPhone,
 consentVersion: CONSENT_VERSION,
 language,
 consentText: consentText(language),
 responseText,
 providerMessageId: inbound.providerMessageId,
 consentedAt,
 createdAt: new Date().toISOString(),
 };
};

// Closes today's check-in from a photo sent now, or one held until the farmer named the activity.
const completeDailyCheckIn = (
 photo: WhatsAppInboundMessage,
 inbound: WhatsAppInboundMessage,
 session: WhatsAppFarmerSession,
 farmer: Farmer | undefined,
 language: 'BM' | 'EN'
): InboundProcessingResult => {
 const evidenceRecord = farmer ? buildEvidenceRecord(farmer, photo, session) : undefined;
 const farmerUpdate = farmer && evidenceRecord
 ? evaluateFarmerCompliance(farmer, [evidenceRecord]).farmer
 : undefined;
 const checkInFeedback = farmer && evidenceRecord
 ? buildDailyCheckInFeedback(farmerUpdate || farmer, evidenceRecord, language)
 : undefined;
 session.pendingLocation = undefined;
 session.pendingActivity = undefined;
 session.pendingPhoto = undefined;
 session.photoReminderSentAt = undefined;
 session.step = 'active';

 const bothConfirmedText = farmer
 ? checkInFeedback?.text || (language === 'EN'
 ? `Thank you, Pak ${firstName(farmer.name)}. Your location and photo have both been confirmed and recorded. Today's evidence is now in the FELDA workspace.`
 : `Terima kasih, Pak ${firstName(farmer.name)}. Lokasi dan gambar anda kedua-duanya telah disahkan dan direkodkan. Bukti hari ini masuk ke ruang kerja FELDA.`)
 : (language === 'EN'
 ? 'Photo received, but the farmer account is not linked yet. A FELDA officer needs to review this.'
 : 'Gambar diterima, tetapi akaun petani belum dipautkan. Pegawai FELDA perlu semak.');

 // A completed check-in is a natural end of this conversation, so close
 // with a quick 1-5 satisfaction nudge rather than just going silent.
 if (farmer) {
 session.pendingSurvey = true;
 }
 const surveyPromptText = farmer
 ? (language === 'EN'
 ? 'On a scale of 1 to 5, how would you rate your experience with this WhatsApp assistant today? Reply with a number from 1 to 5, or SKIP.'
 : 'Pada skala 1 hingga 5, bagaimana anda menilai pengalaman anda dengan pembantu WhatsApp ini hari ini? Balas dengan nombor 1 hingga 5, atau LANGKAU.')
 : undefined;

 return {
 session,
 farmerUpdate,
 evidenceRecord,
 reply: withSessionStep(
 {
 farmerId: session.farmerId,
 intent: 'daily_checkin',
 requiresHumanReview: (!farmer || evidenceRecord?.verificationStatus === 'needs_review') || undefined,
 feedback: checkInFeedback?.feedback,
 evidence: evidenceRecord
 ? {
 evidenceId: evidenceRecord.id,
 activityType: evidenceRecord.activityType,
 verificationStatus: evidenceRecord.verificationStatus,
 reviewStatus: evidenceRecord.review?.status,
 locationValidation: evidenceRecord.locationValidation,
 }
 : undefined,
 text: [bothConfirmedText, surveyPromptText].filter(Boolean).join('\n\n'),
 },
 inbound,
 session.step
 ),
 };
};

// Licence numbers are short and not secret, so cap guesses per phone.
const MAX_MPOB_LINK_ATTEMPTS = 5;
const MPOB_LINK_LOCKOUT_MS = 30 * 60 * 1000;

const mpobLockoutText = (language: 'BM' | 'EN') => language === 'EN'
 ? 'Too many incorrect MPOB licence numbers. Please wait 30 minutes and try again, or contact your FELDA officer.'
 : 'Terlalu banyak nombor lesen MPOB yang salah. Sila tunggu 30 minit dan cuba lagi, atau hubungi pegawai FELDA anda.';

const buildReplyForInbound = (
 inbound: WhatsAppInboundMessage,
 farmersById: Map<string, Farmer>,
 sessionsByPhone: Map<string, WhatsAppFarmerSession>
): InboundProcessingResult => {
 const now = new Date().toISOString();
 const text = inbound.text?.trim();
 const upperText = text?.toUpperCase();
 const existingSession = sessionsByPhone.get(inbound.fromPhone);
 const session: WhatsAppFarmerSession = {
 ...(existingSession || createSession(inbound.fromPhone, now)),
 lastInboundAt: inbound.receivedAt,
 updatedAt: now,
 };

 if (session.step === 'language') {
 if (!isLanguageChoice(upperText)) {
 return {
 session,
 reply: withSessionStep({ intent: 'onboarding', text: languagePrompt }, inbound, session.step),
 };
 }

 session.language = normalizeExactChoice(upperText) as 'BM' | 'EN';
 session.step = 'consent';
 return {
 session,
 reply: withSessionStep({ intent: 'consent', text: consentText(session.language) }, inbound, session.step),
 };
 }

 if (session.step === 'consent') {
 if (!isConsentChoice(upperText)) {
 return {
 session,
 reply: withSessionStep({ intent: 'consent', text: consentText(session.language || 'BM') }, inbound, session.step),
 };
 }

 session.consentVersion = CONSENT_VERSION;
 session.consentedAt = now;
 session.step = 'mpob';
 return {
 session,
 consentRecord: buildConsentRecord(inbound, session, upperText || text || '', now),
 reply: withSessionStep(
 {
 intent: 'mpob_link',
 text: 'Terima kasih. Sila masukkan nombor lesen MPOB 6 digit anda untuk pautkan akaun. / Thank you. Please enter your 6-digit MPOB licence number.',
 },
 inbound,
 session.step
 ),
 };
 }

 if (session.step === 'mpob') {
 const language = session.language || 'BM';
 const mpobReply = (replyText: string, requiresHumanReview?: boolean) => ({
 session,
 reply: withSessionStep(
 { farmerId: session.farmerId, intent: 'mpob_link' as const, requiresHumanReview, text: replyText },
 inbound,
 session.step
 ),
 });

 // One open request per phone: a pending review must not be swapped for another licence.
 if (session.identityConflict?.status === 'open') {
 return mpobReply(
 language === 'EN'
 ? 'Your MPOB licence is still being verified by FELDA. We will message you here once it is approved.'
 : 'Lesen MPOB anda masih disemak oleh FELDA. Kami akan maklumkan di sini sebaik sahaja ia diluluskan.',
 true
 );
 }

 if (session.mpobLockedUntil && Date.parse(session.mpobLockedUntil) > Date.parse(now)) {
 return mpobReply(mpobLockoutText(language));
 }

 const linkedFarmer = findFarmerByMpoBLicence(farmersById, text);

 if (!linkedFarmer) {
 const failedAttempts = (session.mpobFailedAttempts || 0) + 1;

 if (failedAttempts >= MAX_MPOB_LINK_ATTEMPTS) {
 session.mpobFailedAttempts = undefined;
 session.mpobLockedUntil = new Date(Date.parse(now) + MPOB_LINK_LOCKOUT_MS).toISOString();
 return mpobReply(mpobLockoutText(language));
 }

 session.mpobFailedAttempts = failedAttempts;
 return mpobReply(
 language === 'EN'
 ? 'MPOB licence number not found. Please check and send the correct 6-digit number.'
 : 'Nombor lesen MPOB tidak dijumpai. Sila semak dan hantar nombor 6 digit yang betul.'
 );
 }

 session.mpobFailedAttempts = undefined;
 session.mpobLockedUntil = undefined;

 // A licence number is not proof of identity, so it never links a phone on its
 // own: every link becomes a FELDA review request, and the reply does not reveal
 // whose licence it is.
 const existingFarmerId = session.farmerId;
 const linkedSessionForFarmer = findLinkedSessionForFarmer(sessionsByPhone, linkedFarmer.id, inbound.fromPhone);
 const conflictBase = {
 requestedFarmerId: linkedFarmer.id,
 providerMessageId: inbound.providerMessageId,
 detectedAt: now,
 status: 'open' as const,
 };
 session.identityStatus = 'conflict';
 session.identityConflict = existingFarmerId && existingFarmerId !== linkedFarmer.id
 ? { ...conflictBase, type: 'phone_linked_to_different_farmer', existingFarmerId }
 : linkedSessionForFarmer
 ? { ...conflictBase, type: 'farmer_linked_to_different_phone', existingPhoneNumber: linkedSessionForFarmer.phoneNumber }
 : { ...conflictBase, type: 'first_link_review' };

 return mpobReply(
 session.identityConflict.type === 'first_link_review'
 ? language === 'EN'
 ? 'Thank you. Your MPOB licence has been sent to FELDA for verification. We will message you here once it is approved.'
 : 'Terima kasih. Lesen MPOB anda telah dihantar kepada FELDA untuk pengesahan. Kami akan maklumkan di sini sebaik sahaja ia diluluskan.'
 : language === 'EN'
 ? 'This MPOB licence needs FELDA identity review before it can be linked to this WhatsApp number. A FELDA officer will check the account.'
 : 'Lesen MPOB ini memerlukan semakan identiti FELDA sebelum boleh dipautkan kepada nombor WhatsApp ini. Pegawai FELDA akan menyemak akaun ini.',
 true
 );
 }

 if (session.step === 'awaiting_location' || session.step === 'active') {
 const stepFarmer = session.farmerId ? farmersById.get(session.farmerId) : undefined;
 const stepLanguage = session.language || stepFarmer?.whatsappLanguage || 'BM';

 // A pending survey nudge intercepts a 1-5 reply, SKIP, and other small talk
 // (re-asked so "ok" or "6" doesn't jump to the location prompt). An activity
 // word, a photo, or a location falls straight through to the normal check-in
 // flow below rather than blocking the farmer on a rating.
 if (session.pendingSurvey && inbound.kind === 'text') {
 const surveyReply = normalizeExactChoice(upperText) ?? '';
 const ratingMatch = surveyReply.match(/^[1-5]$/);
 if (ratingMatch) {
 const rating = Number(ratingMatch[0]);
 session.pendingSurvey = false;
 return {
 session,
 surveyResponse: {
 phoneNumber: inbound.fromPhone,
 farmerId: session.farmerId,
 rating,
 providerMessageId: inbound.providerMessageId,
 respondedAt: now,
 },
 reply: withSessionStep(
 {
 farmerId: session.farmerId,
 intent: 'survey',
 text: stepLanguage === 'EN'
 ? `Thank you for your feedback! You rated today's experience ${rating}/5.`
 : `Terima kasih atas maklum balas anda! Anda menilai pengalaman hari ini ${rating}/5.`,
 },
 inbound,
 session.step
 ),
 };
 }

 if (surveyReply === 'SKIP' || surveyReply === 'LANGKAU') {
 session.pendingSurvey = false;
 return {
 session,
 reply: withSessionStep(
 {
 farmerId: session.farmerId,
 intent: 'survey',
 text: stepLanguage === 'EN'
 ? 'No problem, the survey is skipped. Share your farm location whenever you are ready for your next check-in.'
 : 'Tiada masalah, tinjauan dilangkau. Kongsi lokasi kebun anda apabila sedia untuk daftar masuk seterusnya.',
 },
 inbound,
 session.step
 ),
 };
 }

 if (!detectActivityFromText(text)) {
 return {
 session,
 reply: withSessionStep(
 {
 farmerId: session.farmerId,
 intent: 'survey',
 text: stepLanguage === 'EN'
 ? 'Please rate today\'s experience with a number from 1 to 5, or reply SKIP.'
 : 'Sila nilai pengalaman hari ini dengan nombor 1 hingga 5, atau balas LANGKAU.',
 },
 inbound,
 session.step
 ),
 };
 }
 session.pendingSurvey = false;
 }

 // A farmer who already completed today's check-in (step 'active') can still
 // send more photos that help their case — a second angle, pest damage, a
 // chemical storage shot, and so on. These are supplementary evidence, not a
 // new check-in, so they don't require a fresh GPS share. A caption is asked
 // for explicitly here (unlike the first photo, which defaults to "inspect"
 // when uncaptioned) because supplementary evidence is worthless to FELDA
 // without knowing what it's meant to show.
 if (session.step === 'active' && inbound.kind === 'image') {
 if (!text) {
 // No fresh evidence exists yet for an uncaptioned photo, so guidance here
 // can only draw on the farmer's standing record (yield anomaly,
 // deforestation flag) — not today's GPS status, which needs an evidence
 // record to evaluate.
 const captionGuidance = stepFarmer ? buildCaseGuidanceText(stepFarmer, stepLanguage) : undefined;
 const baseText = stepLanguage === 'EN'
 ? 'Thanks for the extra photo! Please resend it with a short caption describing what it shows (for example: harvest, pest damage, chemical storage) so FELDA can review it correctly.'
 : 'Terima kasih atas gambar tambahan! Sila hantar semula gambar itu dengan kapsyen ringkas yang menerangkan apa yang ditunjukkan (contohnya: tuai, kerosakan perosak, penyimpanan kimia) supaya FELDA boleh menyemaknya dengan betul.';

 return {
 session,
 reply: withSessionStep(
 {
 farmerId: session.farmerId,
 intent: 'daily_checkin',
 text: captionGuidance ? `${baseText} ${captionGuidance}` : baseText,
 },
 inbound,
 session.step
 ),
 };
 }

 const farmer = stepFarmer;
 const supplementaryEvidence = farmer ? buildEvidenceRecord(farmer, inbound, session) : undefined;

 return {
 session,
 evidenceRecord: supplementaryEvidence,
 reply: withSessionStep(
 {
 farmerId: session.farmerId,
 intent: 'daily_checkin',
 requiresHumanReview: true,
 evidence: supplementaryEvidence
 ? {
 evidenceId: supplementaryEvidence.id,
 activityType: supplementaryEvidence.activityType,
 verificationStatus: supplementaryEvidence.verificationStatus,
 reviewStatus: supplementaryEvidence.review?.status,
 locationValidation: supplementaryEvidence.locationValidation,
 }
 : undefined,
 text: farmer
 ? (stepLanguage === 'EN'
 ? 'Thank you! This additional photo has been added to your file for FELDA review.'
 : 'Terima kasih! Gambar tambahan ini telah ditambah ke fail anda untuk semakan FELDA.')
 : (stepLanguage === 'EN'
 ? 'Photo received, but the farmer account is not linked yet. A FELDA officer needs to review this.'
 : 'Gambar diterima, tetapi akaun petani belum dipautkan. Pegawai FELDA perlu semak.'),
 },
 inbound,
 session.step
 ),
 };
 }

 if (inbound.kind === 'text') {
 const farmer = stepFarmer;
 const language = stepLanguage;
 const pendingActivity = detectActivityFromText(text);

 if (pendingActivity) {
 session.pendingActivity = pendingActivity;
 }

 return {
 session,
 reply: withSessionStep(
 {
 farmerId: session.farmerId,
 intent: 'daily_checkin',
 text: pendingActivity
 ? language === 'EN'
 ? `Activity recorded as ${activityLabel(pendingActivity, 'EN')}. Please share your live farm location, then send today's activity photo.`
 : `Aktiviti dicatat sebagai ${activityLabel(pendingActivity, 'BM')}. Sila kongsi lokasi kebun semasa, kemudian hantar gambar aktiviti hari ini.`
 : language === 'EN'
 ? 'Please share your live farm location first, then send today\'s farm activity photo. You can include words like harvest, prune, spray, weed, or inspect.'
 : 'Sila kongsi lokasi semasa kebun dahulu. Selepas itu, hantar gambar aktiviti hari ini. Anda boleh tulis tuai, cantas, sembur, merumput, atau semak.',
 },
 inbound,
 session.step
 ),
 };
 }

 if (inbound.kind !== 'location' || !inbound.location) {
 return {
 session,
 reply: withSessionStep(
 {
 farmerId: session.farmerId,
 intent: 'daily_checkin',
 text: stepLanguage === 'EN'
 ? 'Please share your live farm location first. Then send today\'s activity photo.'
 : 'Sila kongsi lokasi semasa kebun dahulu. Selepas itu, hantar gambar aktiviti hari ini.',
 },
 inbound,
 session.step
 ),
 };
 }

 session.pendingLocation = inbound.location;
 session.step = 'awaiting_photo';
 return {
 session,
 reply: withSessionStep(
 {
 farmerId: session.farmerId,
 intent: 'daily_checkin',
 // Ask for the activity now if it wasn't stated, so the photo isn't filed under a default.
 text: session.pendingActivity
 ? stepLanguage === 'EN'
 ? `Location confirmed: ${inbound.location.lat.toFixed(5)}, ${inbound.location.lng.toFixed(5)}. Please send today's ${activityLabel(session.pendingActivity, 'EN')} photo.`
 : `Lokasi disahkan: ${inbound.location.lat.toFixed(5)}, ${inbound.location.lng.toFixed(5)}. Sila hantar gambar ${activityLabel(session.pendingActivity, 'BM')} hari ini.`
 : stepLanguage === 'EN'
 ? `Location confirmed: ${inbound.location.lat.toFixed(5)}, ${inbound.location.lng.toFixed(5)}. ${activityQuestion('EN')}`
 : `Lokasi disahkan: ${inbound.location.lat.toFixed(5)}, ${inbound.location.lng.toFixed(5)}. ${activityQuestion('BM')}`,
 },
 inbound,
 session.step
 ),
 };
 }

 if (session.step === 'awaiting_photo') {
 const stepFarmer = session.farmerId ? farmersById.get(session.farmerId) : undefined;
 const stepLanguage = session.language || stepFarmer?.whatsappLanguage || 'BM';

 if (inbound.kind === 'text') {
 const language = stepLanguage;
 const pendingActivity = detectActivityFromText(text);

 if (pendingActivity) {
 session.pendingActivity = pendingActivity;
 }

 // The farmer already sent the photo; naming the activity completes the check-in.
 if (pendingActivity && session.pendingPhoto) {
 const heldPhoto: WhatsAppInboundMessage = {
 provider: inbound.provider,
 providerMessageId: session.pendingPhoto.providerMessageId,
 fromPhone: inbound.fromPhone,
 receivedAt: session.pendingPhoto.receivedAt,
 kind: 'image',
 mediaId: session.pendingPhoto.mediaId,
 mimeType: session.pendingPhoto.mimeType,
 raw: undefined,
 };
 return completeDailyCheckIn(heldPhoto, inbound, session, stepFarmer, stepLanguage);
 }

 return {
 session,
 reply: withSessionStep(
 {
 farmerId: session.farmerId,
 intent: 'daily_checkin',
 text: pendingActivity
 ? language === 'EN'
 ? `Activity updated to ${activityLabel(pendingActivity, 'EN')}. Now send today's farm activity photo.`
 : `Aktiviti dikemas kini kepada ${activityLabel(pendingActivity, 'BM')}. Sekarang hantar gambar aktiviti kebun hari ini.`
 : session.pendingPhoto
 ? activityQuestion(language)
 : language === 'EN'
 ? 'Location is already received. Now send today\'s farm activity photo.'
 : 'Lokasi sudah diterima. Sekarang hantar gambar aktiviti kebun hari ini.',
 },
 inbound,
 session.step
 ),
 };
 }

 if (inbound.kind !== 'image') {
 return {
 session,
 reply: withSessionStep(
 {
 farmerId: session.farmerId,
 intent: 'daily_checkin',
 text: stepLanguage === 'EN'
 ? 'Location already received. Now send today\'s farm activity photo.'
 : 'Lokasi sudah diterima. Sekarang hantar gambar aktiviti kebun hari ini.',
 },
 inbound,
 session.step
 ),
 };
 }

 // Hold an uncaptioned photo instead of filing it under a default activity.
 if (!detectActivityFromText(text) && !session.pendingActivity) {
 session.pendingPhoto = {
 providerMessageId: inbound.providerMessageId,
 mediaId: inbound.mediaId,
 mimeType: inbound.mimeType,
 receivedAt: inbound.receivedAt,
 };
 return {
 session,
 reply: withSessionStep(
 {
 farmerId: session.farmerId,
 intent: 'daily_checkin',
 text: stepLanguage === 'EN'
 ? `Photo received. ${activityQuestion('EN')}`
 : `Gambar diterima. ${activityQuestion('BM')}`,
 },
 inbound,
 session.step
 ),
 };
 }

 return completeDailyCheckIn(inbound, inbound, session, stepFarmer, stepLanguage);
 }

 if (text) {
 const farmer = session.farmerId ? farmersById.get(session.farmerId) : undefined;
 const language = session.language || farmer?.whatsappLanguage || 'BM';
 const intent: ChatbotIntent =
 upperText?.includes('HUTAN') || upperText?.includes('FOREST') || upperText?.includes('BAJA') || upperText?.includes('FERTILIZER')
 ? 'compliance_question'
 : 'onboarding';

 return {
 session,
 reply: withSessionStep(
 {
 farmerId: session.farmerId,
 intent,
 text:
 intent === 'compliance_question'
 ? buildComplianceQuestionReply(farmer, language)
 : languagePrompt,
 },
 inbound,
 session.step
 ),
 };
 }

 const fallbackFarmer = session.farmerId ? farmersById.get(session.farmerId) : undefined;
 const fallbackLanguage = session.language || fallbackFarmer?.whatsappLanguage || 'BM';

 return {
 session,
 reply: withSessionStep(
 {
 farmerId: session.farmerId,
 intent: 'unsupported',
 requiresHumanReview: true,
 text: fallbackLanguage === 'EN'
 ? 'Sorry, this message type is not supported yet. Please send text, location, or a farm photo.'
 : 'Maaf, jenis mesej ini belum disokong. Sila hantar teks, lokasi, atau gambar kebun.',
 },
 inbound,
 session.step
 ),
 };
};

export const handleWhatsAppWebhook = (
 body: unknown,
 farmersById: Map<string, Farmer>,
 sessionsByPhone: Map<string, WhatsAppFarmerSession> = new Map()
): WhatsAppWebhookResult => {
 return handleWhatsAppInboundMessages(parseWhatsAppCloudWebhook(body), farmersById, sessionsByPhone);
};

export const handleWhatsAppInboundMessages = (
 inboundMessages: WhatsAppInboundMessage[],
 farmersById: Map<string, Farmer>,
 sessionsByPhone: Map<string, WhatsAppFarmerSession> = new Map()
): WhatsAppWebhookResult => {
 const farmerUpdates: Farmer[] = [];
 const evidenceRecords: EvidenceRecord[] = [];
 const consentRecords: ConsentRecord[] = [];
 const surveyResponses: WhatsAppSurveyResponse[] = [];
 const events: WhatsAppWebhookEvent[] = [];

 for (const inbound of inboundMessages) {
 const result = buildReplyForInbound(inbound, farmersById, sessionsByPhone);
 sessionsByPhone.set(result.session.phoneNumber, result.session);
 if (result.farmerUpdate) {
 farmersById.set(result.farmerUpdate.id, result.farmerUpdate);
 farmerUpdates.push(result.farmerUpdate);
 }
 if (result.evidenceRecord) {
 evidenceRecords.push(result.evidenceRecord);
 }
 if (result.consentRecord) {
 consentRecords.push(result.consentRecord);
 }
 if (result.surveyResponse) {
 surveyResponses.push(result.surveyResponse);
 }

 events.push({
 inbound,
 reply: result.reply,
 session: result.session,
 storedAt: new Date().toISOString(),
 });
 }

 return {
 accepted: true,
 inboundCount: inboundMessages.length,
 replies: events.map((event) => event.reply),
 events,
 sessions: [...sessionsByPhone.values()],
 farmerUpdates,
 evidenceRecords,
 consentRecords,
 surveyResponses,
 };
};
