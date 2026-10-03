import { parse, type HTMLElement } from "node-html-parser";

/**
 * Parse entry Oxford Learner's Dictionaries (VU-32 SF-1) — PURE: html in,
 * OxfordEntry out, không IO. Selectors chốt trên HTML thật 2026-10-04
 * (fixtures `./fixtures/` là contract test):
 * - headword: `h1.headword` (BẮT BUỘC — thiếu → parse fail, trả null)
 * - pos: `span.pos` (distinct, join ", " khi entry nhiều POS)
 * - ipa/audio uk+us: `div.sound.pron-uk|pron-us` — data-src-mp3 là URL mp3;
 *   `span.phon` là sibling NGAY SAU div → IPA của variant đó (span.phon không
 *   mang region class — phải đi qua div)
 * - cefr: attr `fkcefr` trên `li.sense` ĐẦU TIÊN có attr (Oxford lowercase —
 *   normalize uppercase A1–C2); không có → null
 * - ox3000: attr `ox3000="y"` trên h1.headword
 * - senses: mọi `li.sense` NGOÀI block idioms/phrasal-verbs
 * - idioms: `span.idm-g` → {headword: `span.idm`, senses}; phrasalVerbs:
 *   `span.phrvb-g` → {headword: `span.phrvb`, senses}
 * Field entry không có → null (US-only không UK audio là BÌNH THƯỜNG, không fail).
 */

export type Sense = {
  def: string | null;
  examples: string[];
};

export type SubEntry = {
  headword: string;
  senses: Sense[];
};

export type OxfordEntry = {
  headword: string;
  pos: string | null;
  ipaUk: string | null;
  ipaUs: string | null;
  audioUkUrl: string | null;
  audioUsUrl: string | null;
  cefr: string | null;
  ox3000: boolean;
  senses: Sense[];
  idioms: SubEntry[];
  phrasalVerbs: SubEntry[];
};

function text(el: HTMLElement | null | undefined): string | null {
  const t = el?.text?.replace(/\s+/g, " ").trim();
  return t ? t : null;
}

function parseSense(li: HTMLElement): Sense {
  const def = text(li.querySelector("span.def"));
  const examples = li
    .querySelectorAll("span.x")
    .map((x) => x.text.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return { def, examples };
}

/** Senses trong 1 container (mỗi li.sense 1 Sense). */
function parseSenseList(container: HTMLElement): Sense[] {
  return container.querySelectorAll("li.sense").map(parseSense);
}

/** Sub-entry (idiom/phrasal) từ 1 group block: span.idm-g | span.phrvb-g. */
function parseSubEntries(root: HTMLElement, groupClass: string, itemClass: string): SubEntry[] {
  return root
    .querySelectorAll(`.${groupClass}`)
    .map((group) => {
      const headword = text(group.querySelector(`.${itemClass}`));
      if (!headword) return null;
      return { headword, senses: parseSenseList(group) };
    })
    .filter((x): x is SubEntry => x !== null);
}

/** Variant IPA + mp3: div.sound.pron-uk|pron-us → data-src-mp3 + span.phon sau nó. */
function parseVariant(root: HTMLElement, regionClass: string): { ipa: string | null; audioUrl: string | null } {
  const sound = root.querySelector(`div.sound.${regionClass}`);
  if (!sound) return { ipa: null, audioUrl: null };
  const audioUrl = sound.getAttribute("data-src-mp3") || null;
  const ipa = text(sound.nextElementSibling?.tagName === "SPAN" ? sound.nextElementSibling : null);
  return { ipa, audioUrl };
}

export function parseEntry(html: string): OxfordEntry | null {
  // parse() trả HTMLElement — element type của node-html-parser (KHÔNG phải
  // DOM Element global — không có .text/querySelector đúng kiểu).
  const root = parse(html);
  const headword = text(root.querySelector("h1.headword"));
  if (!headword) return null; // parse fail — selector miss / trang lỗi

  const uk = parseVariant(root, "pron-uk");
  const us = parseVariant(root, "pron-us");

  const posList = [
    ...new Set(
      root
        .querySelectorAll("span.pos")
        .map((p) => p.text.replace(/\s+/g, " ").trim())
        .filter(Boolean),
    ),
  ];

  const subBlocks = [
    ...root.querySelectorAll("div.idioms"),
    ...root.querySelectorAll("div.phrasal-verbs"),
  ];
  const subLis = new Set<HTMLElement>();
  for (const block of subBlocks) {
    for (const li of block.querySelectorAll("li.sense")) subLis.add(li);
  }
  const senses = root
    .querySelectorAll("li.sense")
    .filter((li) => !subLis.has(li))
    .map(parseSense);

  const cefrRaw = root
    .querySelectorAll("li.sense")
    .map((li) => li.getAttribute("fkcefr"))
    .find((v): v is string => !!v);

  return {
    headword,
    pos: posList.length > 0 ? posList.join(", ") : null,
    ipaUk: uk.ipa,
    ipaUs: us.ipa,
    audioUkUrl: uk.audioUrl,
    audioUsUrl: us.audioUrl,
    cefr: cefrRaw ? cefrRaw.toUpperCase() : null,
    ox3000: root.querySelector("h1.headword")?.getAttribute("ox3000") === "y",
    senses,
    idioms: parseSubEntries(root, "idm-g", "idm"),
    phrasalVerbs: parseSubEntries(root, "phrvb-g", "phrvb"),
  };
}
