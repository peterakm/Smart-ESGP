export enum FarmerStatus {
 ELIGIBLE_SOON = 'Eligible soon',
 CERTIFIED = 'Certified',
 INACTIVE = 'Inactive',
 FLAGGED = 'Flagged',
 IN_PROGRESS = 'In progress',
}

export interface Waypoint {
 lat: number;
 lng: number;
 timestamp?: string;
 activity?: string;
}

export interface AuditLog {
 timestamp: string;
 action: string;
 user: string;
 details: string;
}

export interface Anomaly {
 type: string;
 description: string;
 probableCause: string;
 recommendedAction: string;
 severity: 'high' | 'medium' | 'low';
}

export interface EvidenceSummary {
 checkIns: number;
 activities: {
 harvest: number;
 prune: number;
 spray: number;
 weed: number;
 inspect: number;
 };
 deliveries: number;
}

export interface EvidenceRecord {
 id: string;
 farmerId: string;
 source: 'whatsapp';
 evidenceType: 'daily_checkin';
 activityType: keyof EvidenceSummary['activities'];
 verificationStatus: 'received' | 'verified' | 'needs_review';
 phoneNumber: string;
 providerMessageId: string;
 mediaId?: string;
 mimeType?: string;
 location?: {
 lat: number;
 lng: number;
 };
 receivedAt: string;
 createdAt: string;
 summary: string;
 intake?: EvidenceIntakeMetadata;
 locationValidation?: EvidenceLocationValidation;
 mediaStorage?: EvidenceMediaStorage;
 review?: EvidenceReview;
 reviewHistory?: EvidenceReview[];
}

export interface EvidenceIntakeMetadata {
 channel: 'whatsapp';
 provider: 'whatsapp-cloud-api';
 providerMessageId: string;
 receivedMessageKind: 'text' | 'image' | 'voice' | 'location' | 'unknown';
 language?: 'BM' | 'EN';
 sessionStep: 'language' | 'consent' | 'mpob' | 'awaiting_location' | 'awaiting_photo' | 'active';
 activitySource: 'caption' | 'pending_session' | 'default';
 collectedAt: string;
 completeness: {
 linkedFarmer: boolean;
 hasConsent: boolean;
 hasLocation: boolean;
 hasMedia: boolean;
 hasActivity: boolean;
 };
}

export interface EvidenceLocationValidation {
 status: 'inside_plot' | 'outside_plot' | 'unknown_plot' | 'missing_location';
 checkedAt: string;
 distanceMeters?: number;
 reason?: string;
}

export interface EvidenceMediaStorage {
 mode: 'stored' | 'dry_run' | 'failed';
 provider: 'local-filesystem' | 's3' | 'none';
 storageKey?: string;
 storageUrl?: string;
 contentType?: string;
 sizeBytes?: number;
 sha256?: string;
 providerSha256?: string;
 storedAt: string;
 error?: string;
}

export interface EvidenceReview {
 status: 'pending' | 'approved' | 'rejected' | 'flagged';
 reviewedBy?: string;
 reviewedAt?: string;
 notes?: string;
}

export interface SystemAuditEvent {
 id: string;
 service: 'dashboard' | 'whatsapp';
 action: string;
 actorType: 'system' | 'farmer' | 'auditor' | 'api';
 actorId?: string;
 entityType: 'service' | 'farmer' | 'evidence' | 'certificate' | 'whatsapp_message' | 'whatsapp_session';
 entityId?: string;
 severity: 'info' | 'warning' | 'error';
 message: string;
 metadata?: Record<string, string | number | boolean | null | undefined>;
 createdAt: string;
}

export interface CertificateRecord {
 id: string;
 farmerId: string;
 certificateNumber: string;
 status: 'issued' | 'suspended' | 'revoked' | 'expired';
 issuedAt: string;
 expiresAt: string;
 issuedBy: string;
 verificationHash: string;
 scoreAtIssue: number;
 evidenceDaysAtIssue: number;
 standard: 'MSPO-MS2530-2022';
}

export interface ConsentRecord {
 id: string;
 farmerId?: string;
 phoneNumber: string;
 consentVersion: string;
 language: 'BM' | 'EN';
 consentText: string;
 responseText: string;
 providerMessageId: string;
 consentedAt: string;
 createdAt: string;
}

export interface Farmer {
 id: string;
 name: string;
 mpobLicence: string;
 mspoCertId: string;
 plotLocation: string;
 plotArea: number; // in hectares
 polygonWaypoints: Waypoint[];
 score: number; // 0-100
 daysCollected: number;
 lastActivityDate: string;
 status: FarmerStatus;
 post2020Status: 'Clean' | 'Deforested' | 'Pending';
 whispStatus: 'Clean (Sentinel-2 + FAO Whisp)' | 'Flagged (Deforestation Detected)' | 'Pending Review';
 pdpaConsent: boolean;
 transactionsCount: number;
 actualYield: number; // tons in last 30 days
 annualProjection: number; // projected total tonnes per year
 expectedYieldCeiling: number; // expected total tonnes per year
 anomalies: Anomaly[];
 auditLogs: AuditLog[];
 evidenceSummary: EvidenceSummary;
 whatsappLanguage?: 'BM' | 'EN';
 onboardingStep?: 'language' | 'consent' | 'mpob' | 'completed';
}

export interface Message {
 id: string;
 sender: 'farmer' | 'bot';
 timestamp: string;
 text?: string;
 mediaUrl?: string;
 mediaType?: 'image' | 'voice' | 'location';
 activityType?: string;
 locationData?: { lat: number; lng: number };
 duration?: string;
 isNotification?: boolean;
 notificationType?: 'reminder' | 'cert';
}
