export { ClientPortal } from "./portal.js";
export type {
  ClientProfile,
  ClientCredentials,
  ClientStatus,
  KYCInformation,
  KYCStatus,
  ClientEncryption,
  UCANToken,
  EncryptedDocument,
  ComplaintSubmission,
  DocumentAccessLevel,
  EmailVerificationRequest,
  KYCVerificationResponse
} from "./types.js";
export {
  ComplaintGeneratorBridge,
  type ComplaintClassification,
  type LegalStatute,
  type EvidenceSuggestion,
  type LegalResource,
  type WebArchiveResult,
  type ComplaintGenerationResult
} from "./complaint-generator-bridge.js";
