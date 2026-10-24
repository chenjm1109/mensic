// 案例静态资源（chart.py / tokens.yaml）的取用与缓存。
// 渲染器（Pyodide / 本端原生 / 未来的云端）统一只接收「源码文本」而不是 URL，
// 这样同一份 spec 在任何后端都能用，后端也不需要感知应用的资源协议。
import { assetUrl, type GalleryCase } from "@/gallery";
import { storedTemplate } from "@/gallery/library";

const textCache = new Map<string, Promise<string>>();

/** 按 URL 缓存静态文本（同一份资源只取一次） */
export function fetchAssetText(url: string): Promise<string> {
  let p = textCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`资源加载失败（${r.status}）：${url}`);
      return r.text();
    });
    // 失败不缓存，允许后续重试
    p.catch(() => textCache.delete(url));
    textCache.set(url, p);
  }
  return p;
}

export interface CaseSources {
  chartSource: string;
  tokensSource: string;
}

/** 案例的渲染输入：chart.py 与设计令牌（tokens.yaml）的源码 */
export async function caseSources(c: GalleryCase): Promise<CaseSources> {
  const tokensUrl = assetUrl("design/tokens.yaml");
  if (!tokensUrl) throw new Error("渲染资源缺失");
  // 用户导入的模板：源码就在模板库里（不依赖打包资源）
  const local = storedTemplate(c.id);
  if (local) {
    const tokensSource = await fetchAssetText(tokensUrl);
    return { chartSource: local.source, tokensSource };
  }
  const chartUrl = assetUrl(`cases/${c.id}/chart.py`);
  if (!chartUrl) throw new Error("渲染资源缺失");
  const [chartSource, tokensSource] = await Promise.all([fetchAssetText(chartUrl), fetchAssetText(tokensUrl)]);
  return { chartSource, tokensSource };
}
