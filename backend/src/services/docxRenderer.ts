/**
 * 极简 .docx (Office Open XML) 生成器
 *
 * 不依赖 docx/zip 第三方库，自己拼一个 store-mode ZIP：
 *   - [Content_Types].xml
 *   - _rels/.rels
 *   - word/document.xml
 *   - word/_rels/document.xml.rels
 *   - word/media/imageN.png
 *   - word/styles.xml
 *
 * 浏览器/WPS/Word 打开即可阅读；图片以 PNG 内嵌在 figures 章节。
 */
import { spawnSync } from 'node:child_process';
import type { ProjectArtifacts } from '../types';
import { resolveWritingProfile } from './disciplineProfiles';

interface RenderMeta {
  projectName: string;
  discipline: string;
  question: string;
}

interface FigureImage {
  title: string;
  caption: string;
  dataUrl: string | null;
  rawPng: Buffer | null;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function pickSectionValue(
  artifacts: ProjectArtifacts,
  key: string,
  fallback: string,
): string {
  const sections = artifacts.paperSections;
  if (sections && typeof sections === 'object' && !Array.isArray(sections)) {
    const v = (sections as Record<string, unknown>)[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return fallback;
}

function renderFigurePngs(figures: ProjectArtifacts['figures']): FigureImage[] {
  if (!Array.isArray(figures)) return [];
  return figures.map((f, idx) => {
    const obj = (f ?? {}) as Record<string, unknown>;
    const title = typeof obj.title === 'string' ? obj.title : `图 ${idx + 1}`;
    const caption = typeof obj.caption === 'string' ? obj.caption : '';
    const code = typeof obj.code === 'string' ? obj.code : '';
    let rawPng: Buffer | null = null;
    let dataUrl: string | null = null;
    if (code.trim()) {
      try {
        rawPng = renderMatplotlibToPng(code);
        if (rawPng) {
          dataUrl = `data:image/png;base64,${rawPng.toString('base64')}`;
          process.stderr.write(`[docxRenderer] figure ${idx + 1} ok, ${rawPng.length}B\n`);
        } else {
          process.stderr.write(`[docxRenderer] figure ${idx + 1} empty\n`);
        }
      } catch (err) {
        process.stderr.write(
          `[docxRenderer] figure ${idx + 1} FAIL: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
    } else {
      process.stderr.write(`[docxRenderer] figure ${idx + 1} skip (no code)\n`);
    }
    return { title, caption, dataUrl, rawPng };
  });
}

function renderMatplotlibToPng(code: string): Buffer | null {
  const indent = code
    .split('\n')
    .map((l) => '    ' + l)
    .join('\n');
  const wrapper = `
import io, sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
plt.rcParams["axes.unicode_minus"] = False
try:
${indent}
    buf = io.BytesIO()
    plt.savefig(buf, format="png", bbox_inches="tight", dpi=120)
    plt.close("all")
    sys.stdout.buffer.write(buf.getvalue())
except Exception as e:
    sys.stderr.write(str(e))
    sys.exit(1)
`;
  const result = spawnSync('python3', ['-c', wrapper], {
    timeout: 15_000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, MPLCONFIGDIR: process.env.TMPDIR || '/tmp' },
  });
  if (result.status !== 0) {
    throw new Error(result.stderr?.toString() || 'matplotlib 执行失败');
  }
  if (!result.stdout || result.stdout.length === 0) {
    throw new Error('matplotlib 输出为空');
  }
  return result.stdout;
}

/* -------------------- ZIP (store mode) 编码 -------------------- */

interface ZipEntry {
  name: string;
  data: Buffer;
  crc32: number;
  offset: number;
}

const CRC_TABLE: number[] = (() => {
  const t = new Array<number>(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function buildZip(entries: { name: string; data: Buffer | string }[]): Buffer {
  const list: ZipEntry[] = [];
  const localChunks: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data, 'utf-8');
    const nameBuf = Buffer.from(e.name, 'utf-8');
    const crc = crc32(data);
    list.push({ name: e.name, data, crc32: crc, offset });
    // local file header (signature 0x04034b50)
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4); // version needed
    lfh.writeUInt16LE(0, 6); // flags
    lfh.writeUInt16LE(0, 8); // method = store
    lfh.writeUInt16LE(0, 10); // mod time
    lfh.writeUInt16LE(0, 12); // mod date
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(data.length, 18); // compressed size
    lfh.writeUInt32LE(data.length, 22); // uncompressed size
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28); // extra len
    localChunks.push(lfh, nameBuf, data);
    offset += lfh.length + nameBuf.length + data.length;
  }
  // central directory
  const cdChunks: Buffer[] = [];
  let cdSize = 0;
  for (const e of list) {
    const nameBuf = Buffer.from(e.name, 'utf-8');
    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4); // version made by
    cdh.writeUInt16LE(20, 6); // version needed
    cdh.writeUInt16LE(0, 8);
    cdh.writeUInt16LE(0, 10); // method
    cdh.writeUInt16LE(0, 12);
    cdh.writeUInt16LE(0, 14);
    cdh.writeUInt32LE(e.crc32, 16);
    cdh.writeUInt32LE(e.data.length, 20);
    cdh.writeUInt32LE(e.data.length, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30); // extra
    cdh.writeUInt16LE(0, 32); // comment
    cdh.writeUInt16LE(0, 34); // disk
    cdh.writeUInt16LE(0, 36); // internal attrs
    cdh.writeUInt32LE(0, 38); // external attrs
    cdh.writeUInt32LE(e.offset, 42);
    cdChunks.push(cdh, nameBuf);
    cdSize += cdh.length + nameBuf.length;
  }
  const cdOffset = offset;
  // end of central directory
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(list.length, 8);
  eocd.writeUInt16LE(list.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...localChunks, ...cdChunks, eocd]);
}

/* -------------------- 文档 XML -------------------- */

function buildContentTypes(imageCount: number): string {
  const imageOverrides = Array.from({ length: imageCount }, (_, i) => {
    return `<Override PartName="/word/media/image${i + 1}.png" ContentType="image/png"/>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  ${imageOverrides}
</Types>`;
}

function buildRootRels(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
}

function buildStyles(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Title" w:default="0">
    <w:name w:val="Title"/>
    <w:pPr><w:jc w:val="center"/><w:spacing w:before="240" w:after="360"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Arial Unicode MS" w:hAnsi="Arial Unicode MS" w:eastAsia="Arial Unicode MS"/><w:sz w:val="36"/><w:szCs w:val="36"/><w:b/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1" w:default="0">
    <w:name w:val="heading 1"/>
    <w:pPr><w:spacing w:before="240" w:after="120"/><w:keepNext/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Arial Unicode MS" w:hAnsi="Arial Unicode MS" w:eastAsia="Arial Unicode MS"/><w:sz w:val="28"/><w:szCs w:val="28"/><w:b/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Body" w:default="1">
    <w:pPr><w:jc w:val="both"/><w:ind w:firstLineChars="200"/><w:spacing w:line="360" w:lineRule="auto" w:after="80"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Arial Unicode MS" w:hAnsi="Arial Unicode MS" w:eastAsia="Arial Unicode MS"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Meta" w:default="0">
    <w:pPr><w:jc w:val="center"/><w:spacing w:after="120"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Arial Unicode MS" w:hAnsi="Arial Unicode MS" w:eastAsia="Arial Unicode MS"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>
  </w:style>
</w:styles>`;
}

function tableCell(text: string, bold = false): string {
  return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/><w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:rFonts w:ascii="Arial Unicode MS" w:hAnsi="Arial Unicode MS" w:eastAsia="Arial Unicode MS"/></w:rPr><w:t>${escapeXml(text)}</w:t></w:r></w:p></w:tc>`;
}

function buildMetricsTable(artifacts: ProjectArtifacts): string {
  const metrics = artifacts.experiment?.metrics;
  if (!Array.isArray(metrics) || metrics.length === 0) return '';
  const header = `<w:tr>${tableCell('指标', true)}${tableCell('数值', true)}${tableCell('单位/说明', true)}</w:tr>`;
  const rows = metrics.map((metric) => {
    const note = [metric.unit, metric.note].filter(Boolean).join('；');
    return `<w:tr>${tableCell(metric.name)}${tableCell(metric.value)}${tableCell(note)}</w:tr>`;
  }).join('');
  return `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>表 1 研究设计与报告指标</w:t></w:r></w:p><w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="8"/><w:bottom w:val="single" w:sz="8"/><w:insideH w:val="single" w:sz="4" w:color="BFBFBF"/><w:left w:val="nil"/><w:right w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr>${header}${rows}</w:tbl>`;
}

function buildDocument(
  meta: RenderMeta,
  sections: Array<{ title: string; value: string }>,
  figureImages: FigureImage[],
  refsText: string,
  metricsTableXml: string,
  wordCount: number,
): string {
  const title = escapeXml(meta.projectName || meta.question || '未命名研究');
  const discipline = escapeXml(meta.discipline || '通用');
  const sectionXml = sections
    .map((s) => {
      const paras = s.value
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map(
          (p) =>
            `<w:p><w:pPr><w:pStyle w:val="Body"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial Unicode MS" w:hAnsi="Arial Unicode MS" w:eastAsia="Arial Unicode MS"/></w:rPr><w:t xml:space="preserve">${escapeXml(p)}</w:t></w:r></w:p>`,
        )
        .join('');
      return `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${escapeXml(s.title)}</w:t></w:r></w:p>${paras}`;
    })
    .join('');

  const figureXml = figureImages
    .map((fig, idx) => {
      const rId = `rIdImg${idx + 1}`;
      const cap = escapeXml(fig.caption || fig.title);
      const titleEsc = escapeXml(fig.title);
      if (!fig.rawPng) {
        return `<w:p><w:pPr><w:pStyle w:val="Body"/></w:pPr><w:r><w:t xml:space="preserve">${titleEsc}：图片生成失败（${cap}）</w:t></w:r></w:p>`;
      }
      return (
        `<w:p><w:pPr><w:pStyle w:val="Body"/></w:pPr><w:r><w:t>${titleEsc}</w:t></w:r></w:p>` +
        `<w:p><w:pPr><w:pStyle w:val="Body"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing>` +
        `<wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">` +
        `<wp:extent cx="4572000" cy="3429000"/>` +
        `<wp:docPr id="${idx + 1}" name="${titleEsc}"/>` +
        `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
        `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
        `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
        `<pic:nvPicPr><pic:cNvPr id="${idx + 1}" name="${titleEsc}"/><pic:cNvPicPr/></pic:nvPicPr>` +
        `<pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
        `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="4572000" cy="3429000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
        `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>` +
        `<w:p><w:pPr><w:pStyle w:val="Body"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t>图 ${idx + 1}: ${cap}</w:t></w:r></w:p>`
      );
    })
    .join('');

  const refsXml = refsText
    .split('\n')
    .filter((l) => l.trim())
    .map(
      (l) =>
        `<w:p><w:pPr><w:pStyle w:val="Body"/></w:pPr><w:r><w:t xml:space="preserve">${escapeXml(l)}</w:t></w:r></w:p>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>${title}</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Meta"/></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t>学科：${discipline}　正文约 ${wordCount} 字</w:t></w:r></w:p>
    ${sectionXml}
    ${metricsTableXml}
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>图表</w:t></w:r></w:p>
    ${figureXml}
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>参考文献</w:t></w:r></w:p>
    ${refsXml}
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>
  </w:body>
</w:document>`;
}

function buildDocumentRels(imageCount: number): string {
  const imageRels = Array.from({ length: imageCount }, (_, i) => {
    return `<Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${i + 1}.png"/>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  ${imageRels}
</Relationships>`;
}

export async function renderDocx(
  artifacts: ProjectArtifacts,
  meta: RenderMeta,
): Promise<Buffer> {
  const figureImages = renderFigurePngs(artifacts.figures);
  const validImages = figureImages.filter((f) => f.rawPng);
  const profile = resolveWritingProfile(meta.discipline, meta.question);
  const topic = meta.question || meta.projectName || '本研究';
  const sections = profile.sections.map((section) => ({
    title: section.title,
    value: pickSectionValue(
      artifacts,
      section.key,
      section.key === 'keywords'
        ? `关键词：${profile.keywords.join('；')}`
        : `本节围绕“${topic}”展开，重点说明${section.focus}。${profile.reproducibilityLanguage}。当前内容为待验证的论文初稿，不把模拟信息表述为真实发现。`,
    ),
  }));
  const refs: string[] = [];
  if (Array.isArray(artifacts.literature)) {
    for (const item of artifacts.literature) {
      if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        const t = typeof o.title === 'string' ? o.title : '参考文献';
        const a = Array.isArray(o.authors) ? o.authors.join(', ') : 'RAP Agent';
        const y = typeof o.year === 'number' || typeof o.year === 'string' ? o.year : '2026';
        const venue = typeof o.venue === 'string' ? ` ${o.venue}.` : '';
        const doi = typeof o.doi === 'string' ? ` doi:${o.doi}.` : '';
        refs.push(`${a}. ${t}.${venue} ${y}.${doi}`.replace(/\s+/g, ' ').trim());
      }
    }
  }
  if (refs.length === 0) refs.push('暂无外部引用');
  const wordCount = sections.reduce((sum, section) => sum + section.value.replace(/\s/g, '').length, 0);
  const metricsTableXml = buildMetricsTable(artifacts);

  const entries: { name: string; data: Buffer | string }[] = [
    { name: '[Content_Types].xml', data: buildContentTypes(validImages.length) },
    { name: '_rels/.rels', data: buildRootRels() },
    { name: 'word/_rels/document.xml.rels', data: buildDocumentRels(validImages.length) },
    { name: 'word/styles.xml', data: buildStyles() },
    {
      name: 'word/document.xml',
      data: buildDocument(meta, sections, figureImages, refs.map((ref, index) => `[${index + 1}] ${ref}`).join('\n'), metricsTableXml, wordCount),
    },
  ];
  validImages.forEach((fig, idx) => {
    entries.push({ name: `word/media/image${idx + 1}.png`, data: fig.rawPng! });
  });
  return buildZip(entries);
}
