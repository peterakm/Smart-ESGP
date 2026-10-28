export type WhatsAppMessageKind = 'text' | 'image' | 'location' | 'voice' | 'unknown';

export type ChatbotIntent =
 | 'onboarding'
 | 'consent'
 | 'mpob_link'
 | 'daily_checkin'
 | 'compliance_question'
 | 'survey'
 | 'unsupported';

export interface FarmerFeedback {
 language: 'BM' | 'EN';
 status: string;
 score: number;
 daysCollected: number;
 targetEvidenceDays: number;
 remainingEvidenceDays: number;
 evidenceReviewStatus?: import('../types').EvidenceReview['status'];
 riskLevel: 'normal' | 'watch' | 'flagged';
 nextAction: string;
}

export interface ChatbotEvidenceSummary {
 evidenceId: string;
 activityType: import('../types').EvidenceRecord['activityType'];
 verificationStatus: import('../types').EvidenceRecord['verificationStatus'];
 reviewStatus?: import('../types').EvidenceReview['status'];
 locationValidation?: import('../types').EvidenceLocationValidation;
}

export type WhatsAppOnboardingStep =
 | 'language'
 | 'consent'
 | 'mpob'
 | 'awaiting_location'
 | 'awaiting_photo'
 | 'active';

export interface WhatsAppLocationPayload {
 lat: number;
 lng: number;
 name?: string;
 address?: string;
}

export interface WhatsAppInboundMessage {
 provider: 'whatsapp-cloud-api';
 providerMessageId: string;
 fromPhone: string;
 receivedAt: string;
 kind: WhatsAppMessageKind;
 text?: string;
 mediaId?: string;
 mimeType?: string;
 location?: WhatsAppLocationPayload;
 raw: unknown;
}

export type WhatsAppDeliveryStatusValue =
 | 'sent'
 | 'delivered'
 | 'read'
 | 'failed'
 | 'deleted'
 | 'unknown';

export interface WhatsAppDeliveryStatusError {
 code?: string;
 title?: string;
 message?: string;
}

export interface WhatsAppDeliveryStatus {
 provider: 'whatsapp-cloud-api';
 providerMessageId: string;
 status: WhatsAppDeliveryStatusValue;
 recipientPhone?: string;
 conversationId?: string;
 pricingCategory?: string;
 updatedAt: string;
 errors?: WhatsAppDeliveryStatusError[];
}

export interface ChatbotReply {
 toPhone: string;
 text: string;
 intent: ChatbotIntent;
 sessionStep?: WhatsAppOnboardingStep;
 farmerId?: string;
 requiresHumanReview?: boolean;
 feedback?: FarmerFeedback;
 evidence?: ChatbotEvidenceSummary;
}

export interface WhatsAppWebhookEvent {
 inbound: WhatsAppInboundMessage;
 reply: ChatbotReply;
 outbound?: WhatsAppSendResult;
 session?: WhatsAppFarmerSession;
 storedAt: string;
}

export type WhatsAppProviderMessageClaimStatus = 'claimed' | 'processed';

export interface WhatsAppProviderMessageClaim {
 providerMessageId: string;
 status: WhatsAppProviderMessageClaimStatus;
 claimedAt: string;
 claimExpiresAt?: string;
 processedAt?: string;
 duplicateCount: number;
 lastDuplicateAt?: string;
}

export type WhatsAppMonitoringInboundMessage = Omit<WhatsAppInboundMessage, 'raw'>;
export type WhatsAppMonitoringReply = Omit<ChatbotReply, 'toPhone'>;

export interface WhatsAppMonitoringSendResult {
 mode: WhatsAppSendResult['mode'];
 providerMessageId?: string;
 statusCode?: number;
 error?: string;
 sentAt: string;
}

export interface WhatsAppMonitoringSession {
 step: WhatsAppOnboardingStep;
 language?: 'BM' | 'EN';
 farmerId?: string;
 identityStatus?: WhatsAppFarmerSession['identityStatus'];
 identityConflict?: WhatsAppIdentityConflict;
 updatedAt?: string;
}

export interface WhatsAppMonitoringEvent {
 inbound: WhatsAppMonitoringInboundMessage;
 reply: WhatsAppMonitoringReply;
 outbound?: WhatsAppMonitoringSendResult;
 session?: WhatsAppMonitoringSession;
 storedAt: string;
}

export interface WhatsAppSendRequest {
 toPhone: string;
 text: string;
}

export interface WhatsAppSendResult {
 toPhone: string;
 text: string;
 mode: 'sent' | 'dry_run' | 'failed';
 providerMessageId?: string;
 statusCode?: number;
 error?: string;
 sentAt: string;
}

// A check-in photo sent without an activity, held until the farmer names one.
export interface WhatsAppPendingPhoto {
 providerMessageId: string;
 mediaId?: string;
 mimeType?: string;
 receivedAt: string;
}

export interface WhatsAppFarmerSession {
 phoneNumber: string;
 step: WhatsAppOnboardingStep;
 language?: 'BM' | 'EN';
 consentVersion?: string;
 consentedAt?: string;
 farmerId?: string;
 identityStatus?: 'unlinked' | 'linked' | 'conflict';
 identityConflict?: WhatsAppIdentityConflict;
 // Wrong MPOB licence guesses since the last lockout, and when the current lockout ends.
 mpobFailedAttempts?: number;
 mpobLockedUntil?: string;
 pendingLocation?: WhatsAppLocationPayload;
 pendingActivity?: import('../types').Waypoint['activity'];
 pendingPhoto?: WhatsAppPendingPhoto;
 pendingSurvey?: boolean;
 photoReminderSentAt?: string;
 createdAt: string;
 updatedAt: string;
 lastInboundAt?: string;
}

export interface WhatsAppSurveyResponse {
 phoneNumber: string;
 farmerId?: string;
 rating: number;
 providerMessageId: string;
 respondedAt: string;
}

export interface WhatsAppIdentityConflict {
 // first_link_review: a licence alone never links a phone; FELDA approves every new link.
 type: 'first_link_review' | 'phone_linked_to_different_farmer' | 'farmer_linked_to_different_phone';
 requestedFarmerId?: string;
 existingFarmerId?: string;
 existingPhoneNumber?: string;
 providerMessageId: string;
 detectedAt: string;
 status: 'open' | 'resolved';
 resolution?: 'approved' | 'rejected';
 resolvedAt?: string;
 resolvedBy?: string;
 resolutionNotes?: string;
}

export interface WhatsAppWebhookResult {
 accepted: boolean;
 inboundCount: number;
 replies: ChatbotReply[];
 events: WhatsAppWebhookEvent[];
 sessions: WhatsAppFarmerSession[];
 farmerUpdates: import('../types').Farmer[];
 evidenceRecords: import('../types').EvidenceRecord[];
 consentRecords: import('../types').ConsentRecord[];
 surveyResponses: WhatsAppSurveyResponse[];
}
