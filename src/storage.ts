import { decodeDocument, encodeDocument } from './domain/document';
import type { Document } from './domain/model';
import { SAMPLE } from './domain/sample';
export const STORAGE_KEY='cutover-desk.document.v1';
export type StorageAccess = Pick<Storage,'getItem'|'setItem'>;
export function load(storage: StorageAccess) {
  let raw: string | null = null;
  try { raw=storage.getItem(STORAGE_KEY); return {document:raw===null?structuredClone(SAMPLE):decodeDocument(raw),raw,error:'',blocked:false}; }
  catch { return {document:structuredClone(SAMPLE),raw,error:'Saved data could not be loaded. It has not been overwritten. Export the saved text or explicitly replace it with a valid document.',blocked:true}; }
}
export function save(storage: StorageAccess, document: Document, expected: string | null) {
  const raw=encodeDocument(document);
  try {
    if(storage.getItem(STORAGE_KEY)!==expected) return {raw:expected,error:'Another tab changed this document. Export your current copy, then reload to use the latest saved version.',conflict:true};
    storage.setItem(STORAGE_KEY,raw);
    return {raw,error:'',conflict:false};
  } catch {
    return {raw:expected,error:'Browser storage is unavailable or full. Your work remains in this tab. Export JSON now to keep a backup.',conflict:false};
  }
}
export function download(name: string, content: string, mime: string) {
  const url=URL.createObjectURL(new Blob([content],{type:mime}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
