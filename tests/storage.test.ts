import { expect, it } from 'vitest';
import { load,save,STORAGE_KEY } from '../src/storage';
import { SAMPLE } from '../src/domain/sample';
import { encodeDocument } from '../src/domain/document';
function memory(raw: string | null=null){return {getItem:()=>raw,setItem:(_key:string,value:string)=>{raw=value;}};}
it('loads a new workspace without writing over anything',()=>{const storage=memory();expect(load(storage).blocked).toBe(false);expect(storage.getItem()).toBe(null);});
it('keeps corrupt saved data available for recovery',()=>{const storage=memory('{broken');const loaded=load(storage);expect(loaded.blocked).toBe(true);expect(loaded.raw).toBe('{broken');expect(storage.getItem()).toBe('{broken');});
it('rejects stale-tab writes',()=>{const storage=memory(encodeDocument(SAMPLE));expect(save(storage,SAMPLE,null).conflict).toBe(true);});
it('saves when the expected version matches',()=>{const storage=memory();const result=save(storage,SAMPLE,null);expect(result.error).toBe('');expect(storage.getItem()).toBe(result.raw);expect(STORAGE_KEY).toContain('v1');});
it('reports quota and denied-storage failures without throwing away work',()=>{const storage={getItem:()=>null,setItem:()=>{throw new Error('QuotaExceeded');}};expect(save(storage,SAMPLE,null).error).toContain('Export JSON');expect(load({getItem:()=>{throw new Error();},setItem:()=>{}}).blocked).toBe(true);});
