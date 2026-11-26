import { describe, expect, it, vi } from "vitest";
import { collectCompleteScopedRows } from "@/lib/completeScopedRows";
describe("complete official scoped reads",()=>{
  const rows=Array.from({length:2501},(_,id)=>({id:String(id)}));
  it("reads all 2501 authorized rows without truncation",async()=>{
    const load=vi.fn(async (offset:number,size:number)=>({data:rows.slice(offset,offset+size),error:null}));
    expect((await collectCompleteScopedRows(load)).data).toEqual(rows);
    expect(load).toHaveBeenCalledTimes(6);
  });
  it("handles an exact page multiple",async()=>{
    const load=vi.fn(async (offset:number,size:number)=>({data:rows.slice(0,1000).slice(offset,offset+size),error:null}));
    expect((await collectCompleteScopedRows(load)).data).toHaveLength(1000);
    expect(load).toHaveBeenCalledTimes(3);
  });
  it("rejects duplicate continuation instead of losing records",async()=>{
    await expect(collectCompleteScopedRows(async()=>({data:rows.slice(0,500),error:null}))).rejects.toThrow("mudaram");
  });
  it("does not return partial results if a later request fails",async()=>{
    await expect(collectCompleteScopedRows(async offset=>offset===0?{data:rows.slice(0,500),error:null}:{data:null,error:new Error("unavailable")})).rejects.toThrow("continuação");
  });
  it("preserves the initial authorization error for the existing fallback",async()=>{
    const error=new Error("denied");
    expect(await collectCompleteScopedRows(async()=>({data:null,error}))).toEqual({data:null,error});
  });
});
