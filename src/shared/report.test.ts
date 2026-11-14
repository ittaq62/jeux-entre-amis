import { describe, expect, it } from "vitest";
import { describeDevice, deviceLine } from "./report.ts";

const UA = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1",
  ipadOld: "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  // Une tablette d'Apple récente se présente comme un Mac
  ipadDesktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  androidPhone: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  androidTablet: "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  samsung:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  androidFirefox: "Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.51",
  windowsChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  windowsFirefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  windowsOpera:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  linux: "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0",
  chromebook: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

describe("l'appareil, lu dans ce que le navigateur dit de lui", () => {
  it("les téléphones", () => {
    expect(describeDevice({ ua: UA.iphone, touchPoints: 5 })).toEqual({ kind: "phone", os: "iOS 17.5", browser: "Safari 17.5" });
    expect(describeDevice({ ua: UA.iphoneChrome, touchPoints: 5 })).toEqual({ kind: "phone", os: "iOS 18.1", browser: "Chrome 131" });
    expect(describeDevice({ ua: UA.androidPhone, touchPoints: 5 })).toEqual({ kind: "phone", os: "Android 14", browser: "Chrome 131" });
    expect(describeDevice({ ua: UA.samsung, touchPoints: 5 })).toEqual({ kind: "phone", os: "Android 14", browser: "Samsung Internet 26" });
    expect(describeDevice({ ua: UA.androidFirefox, touchPoints: 5 })).toEqual({ kind: "phone", os: "Android 14", browser: "Firefox 132" });
  });

  it("les tablettes, y compris celle qui se fait passer pour un Mac", () => {
    expect(describeDevice({ ua: UA.ipadOld, touchPoints: 5 })).toEqual({ kind: "tablet", os: "iPadOS 16.6", browser: "Safari 16.6" });
    expect(describeDevice({ ua: UA.ipadDesktop, touchPoints: 5 })).toEqual({ kind: "tablet", os: "iPadOS", browser: "Safari 17.4" });
    expect(describeDevice({ ua: UA.androidTablet, touchPoints: 10 })).toEqual({ kind: "tablet", os: "Android 13", browser: "Chrome 130" });
  });

  it("les PC, même avec un écran tactile", () => {
    expect(describeDevice({ ua: UA.windowsEdge, touchPoints: 10 })).toEqual({ kind: "pc", os: "Windows", browser: "Edge 131" });
    expect(describeDevice({ ua: UA.windowsChrome, touchPoints: 0 })).toEqual({ kind: "pc", os: "Windows", browser: "Chrome 131" });
    expect(describeDevice({ ua: UA.windowsFirefox, touchPoints: 0 })).toEqual({ kind: "pc", os: "Windows", browser: "Firefox 133" });
    expect(describeDevice({ ua: UA.windowsOpera, touchPoints: 0 })).toEqual({ kind: "pc", os: "Windows", browser: "Opera 115" });
    expect(describeDevice({ ua: UA.mac, touchPoints: 0 })).toEqual({ kind: "pc", os: "macOS", browser: "Safari 18.1" });
    expect(describeDevice({ ua: UA.linux, touchPoints: 0 })).toEqual({ kind: "pc", os: "Linux", browser: "Firefox 132" });
    expect(describeDevice({ ua: UA.chromebook, touchPoints: 0 })).toEqual({ kind: "pc", os: "ChromeOS", browser: "Chrome 131" });
  });

  it("ce qui ne se reconnaît pas reste dit honnêtement", () => {
    expect(describeDevice({ ua: "", touchPoints: 0 })).toEqual({ kind: "pc", os: "Système inconnu", browser: "Navigateur inconnu" });
    // Le navigateur qui dit seulement qu'il est sur un téléphone
    expect(describeDevice({ ua: "Truc/1.0", touchPoints: 5, mobile: true }).kind).toBe("phone");
  });

  it("la ligne qui le résume", () => {
    const device = {
      kind: "phone",
      os: "Android 14",
      browser: "Chrome 131",
      screen: { w: 412, h: 915 },
      view: { w: 412, h: 800 },
    } as const;
    expect(deviceLine(device)).toBe("Téléphone, Android 14, Chrome 131, écran 412×915");
    expect(deviceLine({ ...device, screen: { w: 0, h: 0 } })).toBe("Téléphone, Android 14, Chrome 131");
  });
});
