import { CLIPBOARD_MARK } from "@/lib/ebay/page";
import { EBAY_SUFFIXES } from "@/lib/ebay/url";

// The "Lấy sang CardNest" bookmark button. It runs inside the eBay page the owner is looking at, copies that page's source to the
// clipboard (with the page link and the time), and shows a small message. It sends nothing anywhere: the app reads the clipboard
// only when the owner pastes it back (Ctrl+V). Because it does not talk to the app it needs no address and works on every install.

const HOSTS = EBAY_SUFFIXES.map((s) => s.replace(/\./g, "\\.")).join("|");

const SOURCE_LINES = [
  "(function(){",
  `var MARK="${CLIPBOARD_MARK}";`,
  "function toast(msg,bad){",
  "try{",
  'var old=document.getElementById("cardnest-toast");',
  "if(old&&old.parentNode)old.parentNode.removeChild(old);",
  'var box=document.createElement("div");',
  'box.id="cardnest-toast";',
  "box.textContent=msg;",
  'box.style.cssText="position:fixed;z-index:2147483647;top:16px;right:16px;max-width:340px;padding:12px 16px;border-radius:10px;font:14px/1.4 system-ui,sans-serif;color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.35);background:"+(bad?"#b91c1c":"#047857");',
  "document.body.appendChild(box);",
  "setTimeout(function(){if(box.parentNode)box.parentNode.removeChild(box)},7000);",
  "}catch(e){alert(msg)}",
  "}",
  "try{",
  String.raw`if(!/^(?:[a-z0-9-]+\.)*ebay\.(?:${HOSTS})$/i.test(location.hostname)){toast("Hãy mở trang sản phẩm eBay rồi bấm lại nút này.",1);return}`,
  'var text=MARK+"\\n"+location.href+"\\n"+new Date().toISOString()+"\\n"+document.documentElement.outerHTML;',
  "var legacy=function(){",
  'var area=document.createElement("textarea");',
  "area.value=text;",
  'area.style.cssText="position:fixed;top:0;left:0;opacity:0";',
  "document.body.appendChild(area);",
  "area.focus();area.select();",
  "var ok=false;",
  'try{ok=document.execCommand("copy")}catch(e){}',
  "if(area.parentNode)area.parentNode.removeChild(area);",
  "return ok;",
  "};",
  "var finish=function(ok){",
  'toast(ok?"Đã sao chép trang eBay. Quay lại CardNest và nhấn Ctrl+V.":"Không sao chép được. Hãy dùng cách dán mã nguồn trang (Ctrl+U) trong CardNest.",!ok);',
  "};",
  "if(navigator.clipboard&&navigator.clipboard.writeText){",
  "navigator.clipboard.writeText(text).then(function(){finish(true)},function(){finish(legacy())});",
  "}else finish(legacy());",
  '}catch(e){toast("CardNest: "+(e&&e.message?e.message:e),1)}',
  "})();",
];

/** The bookmark's JavaScript, one line. */
export const BOOKMARKLET_SOURCE = SOURCE_LINES.join("");

/** What goes into the bookmark's address field. */
export const BOOKMARKLET_HREF = `javascript:${encodeURIComponent(BOOKMARKLET_SOURCE)}`;
