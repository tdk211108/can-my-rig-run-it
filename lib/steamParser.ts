export interface ParsedRequirement {
  os?: string;
  processor?: string;
  memory?: string;
  graphics?: string;
  storage?: string;
  directX?: string;
  soundCard?: string;
  additionalNotes?: string;
  rawHtml: string;
}

export interface SteamGameDetails {
  id: number;
  name: string;
  shortDescription: string;
  headerImage: string;
  capsuleImage?: string;
  developers: string[];
  publishers: string[];
  genres: string[];
  releaseDate: string;
  price?: SteamPrice;
  priceFormatted?: string;
  minimum?: ParsedRequirement;
  recommended?: ParsedRequirement;
}

export interface SteamPrice {
  initial: number;
  final: number;
  discountPercent: number;
  currency: string;
  initialFormatted?: string;
  finalFormatted?: string;
}

export interface SteamSearchResultItem {
  id: number;
  name: string;
  tiny_image: string;
  price?: {
    initial: number;
    final: number;
    discount_percent?: number;
    initial_formatted?: string;
    final_formatted?: string;
    currency: string;
  };
  platforms: {
    windows: boolean;
    mac: boolean;
    linux: boolean;
  };
}

/**
 * Trích xuất một trường từ chuỗi HTML requirement của Steam
 * Ví dụ tìm: <strong>Processor:</strong> Intel Core i5...</li>
 */
function extractField(html: string, fieldName: string): string | undefined {
  // Regex tìm kiếm pattern: <strong>FieldName:?</strong> value (tới khi gặp <br> hoặc </li>)
  const regex = new RegExp(
    `<strong>\\s*${fieldName}\\s*:?\\s*<\\/strong>\\s*([^<]+(?:<br\\s*\\/?>)?(?![^<]*<strong>))`,
    'i'
  );
  const match = html.match(regex);
  if (match && match[1]) {
    // Làm sạch các thẻ br và khoảng trắng
    return match[1].replace(/<br\s*\/?>/gi, '').trim();
  }

  // Phương án regex dự phòng tìm giữa các thẻ li
  const liRegex = new RegExp(
    `<li>(?:<strong>)?\\s*${fieldName}\\s*:?\\s*(?:<\\/strong>)?\\s*([^<]+)`,
    'i'
  );
  const liMatch = html.match(liRegex);
  if (liMatch && liMatch[1]) {
    return liMatch[1].trim();
  }

  return undefined;
}

/**
 * Phân tích chuỗi HTML cấu hình của Steam thành Object có cấu trúc
 */
export function parseSteamRequirementHtml(rawHtml: string | undefined): ParsedRequirement | undefined {
  if (!rawHtml || typeof rawHtml !== 'string') return undefined;

  return {
    os: extractField(rawHtml, 'OS') || extractField(rawHtml, 'Operating System'),
    processor: extractField(rawHtml, 'Processor') || extractField(rawHtml, 'CPU'),
    memory: extractField(rawHtml, 'Memory') || extractField(rawHtml, 'RAM'),
    graphics: extractField(rawHtml, 'Graphics') || extractField(rawHtml, 'Video Card') || extractField(rawHtml, 'GPU'),
    storage: extractField(rawHtml, 'Storage') || extractField(rawHtml, 'Hard Drive'),
    directX: extractField(rawHtml, 'DirectX'),
    soundCard: extractField(rawHtml, 'Sound Card'),
    additionalNotes: extractField(rawHtml, 'Additional Notes'),
    rawHtml,
  };
}
