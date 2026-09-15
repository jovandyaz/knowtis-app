export const STUDY_FOCUS_ATTRIBUTE = 'data-study-focus';

/** True while a study focus overlay is mounted anywhere in the document. */
export function isStudyFocusOpen(): boolean {
  return document.querySelector(`[${STUDY_FOCUS_ATTRIBUTE}]`) !== null;
}
