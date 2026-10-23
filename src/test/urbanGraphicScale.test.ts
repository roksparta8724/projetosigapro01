import {describe,expect,it} from "vitest";
import {
  buildUrbanGraphicEvidence,measureUrbanGraphicDistance,parseUrbanKnownMeters,urbanPageDistance,
  type UrbanGraphicCalibration,
} from "@/lib/urbanGraphicScale";

const calibration:UrbanGraphicCalibration={
  page:2,referenceMeters:5,
  segment:{a:{x:.1,y:.2},b:{x:.3,y:.2}},
};
const measured={a:{x:.45,y:.45},b:{x:.55,y:.45}};

describe("SIGAPRO IA — régua PDF de calibração humana",()=>{
  it("calcula medida proporcional usando geometria da mesma página",()=>{
    const value=measureUrbanGraphicDistance({
      calibration,measuredSegment:measured,measuredPage:2,pageWidth:1000,pageHeight:700,
    });
    expect(value).toBeCloseTo(2.5,9);
    // Zoom should not change the result when page aspect ratio is preserved.
    expect(measureUrbanGraphicDistance({
      calibration,measuredSegment:measured,measuredPage:2,pageWidth:2000,pageHeight:1400,
    })).toBeCloseTo(value!,9);
  });
  it("não permite escala de outra página, pontos fora do PDF ou calibração mínima",()=>{
    expect(measureUrbanGraphicDistance({
      calibration,measuredSegment:measured,measuredPage:3,pageWidth:1000,pageHeight:700,
    })).toBeNull();
    expect(measureUrbanGraphicDistance({
      calibration,measuredSegment:{a:{x:-.1,y:.5},b:{x:.5,y:.5}},
      measuredPage:2,pageWidth:1000,pageHeight:700,
    })).toBeNull();
    expect(measureUrbanGraphicDistance({
      calibration:{...calibration,segment:{a:{x:.1,y:.1},b:{x:.101,y:.1}}},
      measuredSegment:measured,measuredPage:2,pageWidth:1000,pageHeight:700,
    })).toBeNull();
    expect(urbanPageDistance(measured,0,700)).toBeNull();
    expect(measureUrbanGraphicDistance({
      calibration:{...calibration,referenceMeters:0},
      measuredSegment:measured,measuredPage:2,pageWidth:1000,pageHeight:700,
    })).toBeNull();
  });
  it("não supõe escala do PDF nem aceita metros em unidades ambíguas",()=>{
    expect(parseUrbanKnownMeters("5,50")).toBe(5.5);
    expect(parseUrbanKnownMeters("5.50")).toBe(5.5);
    expect(parseUrbanKnownMeters("0")).toBeNull();
    expect(parseUrbanKnownMeters("1:100")).toBeNull();
    expect(parseUrbanKnownMeters("500 mm")).toBeNull();
    expect(parseUrbanKnownMeters("1.000,00")).toBeNull();
  });
  it("inclui documento, hash, página, calibração, pontos e aviso de caráter indicativo",()=>{
    const citation=buildUrbanGraphicEvidence({
      documentId:"f5d5e9aa-9ef9-4074-ab22-78bc0081e964",fileName:"implantacao.pdf",version:2,
      fileHash:"e".repeat(64),page:2,calibration,
      measuredSegment:measured,measuredMeters:2.5,
    });
    expect(citation).toContain("documento f5d5e9aa");
    expect(citation).toContain("implantacao.pdf");
    expect(citation).toContain("página 2");
    expect(citation).toContain("SHA-256 "+"e".repeat(64));
    expect(citation).toContain("INDICATIVA");
    expect(citation.length).toBeLessThanOrEqual(500);
  });
  it("rejeita evidência para outra prancha ou referência falsa",()=>{
    expect(()=>buildUrbanGraphicEvidence({
      documentId:"../../other",fileName:"implantacao.pdf",version:1,page:2,
      calibration,measuredSegment:measured,measuredMeters:2.5,
    })).toThrow();
    expect(()=>buildUrbanGraphicEvidence({
      documentId:"doc-valid",fileName:"implantacao.pdf",version:1,page:3,
      calibration,measuredSegment:measured,measuredMeters:2.5,
    })).toThrow();
  });
});
