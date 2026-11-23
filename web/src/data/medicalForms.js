/**
 * The blank forms an athlete can download for their medical documents
 * (REQ-04), keyed by document.
 *
 * The federation has not supplied these yet. To publish one, put the file in
 * web/public/assets/medical-forms/ and set its path here, for example:
 *   certificate: '/assets/medical-forms/medical-certificate.pdf'
 * Until a path is set, the Download action shows as not yet available rather
 * than pointing anywhere.
 */
export const MEDICAL_DOCUMENT_TEMPLATES = {
  certificate: null,
  screening: null,
};
