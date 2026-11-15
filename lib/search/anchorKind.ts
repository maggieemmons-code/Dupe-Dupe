/**
 * Each signature detail's kind is decided once per search, in code, so the same
 * detail can't reject a piece in one judge batch and only caveat it in another
 * (review, Nov 15). shape: a visible outline, neckline, toe, heel, trim or
 * embellishment; material: the fabric itself; hidden: construction a photo can't show.
 */
import type { AnchorKind } from "./score";

const MATERIAL = /\b(velvet|jacquard|brocade|satin|silk|charmeuse|crepe|chiffon|tulle|organza|taffeta|lace|leather|suede|pleather|faux leather|wool|cashmere|tweed|linen|cotton|poplin|denim|knit|jersey|ponte|mesh|sheer|fabric|textile|sateen|damask|cloqu[eé]|matelass[eé]|fur|faux fur|shearling|sherpa|boucl[eé])\b/i;
const HIDDEN = /\b(boned|boning|lined|lining|inner corset|built[- ]in|underwire|interfacing|padded|structured interior|hidden)\b/i;
const SHAPE = /\b(neck|neckline|collar|lapel|shoulder|strap|strapless|halter|cowl|bodice|waist|belt|hem|length|train|slit|sleeve|cuff|toe|heel|shaft|silhouette|column|mermaid|a-line|flare|wrap|cut|drape|draped|fold|pleat|peplum|trim|button|zip|pocket|bow|ruffle|ruching|beading|beaded|sequin|pearl|embellish|crystal|print|pattern|stripe|plaid|floral|lock|flap|handle|buckle|shawl|oversized|cropped|tailored|fitted|bias|glove|gloves|scarf|cape|hood)\b/i;

export function anchorKind(label: string): AnchorKind {
  const material = MATERIAL.test(label);
  const hidden = HIDDEN.test(label);
  const shape = SHAPE.test(label);
  // "Deep burgundy velvet", "Liquid sapphire blue satin", "tonal floral jacquard fabric": the fabric itself.
  if (material && (!shape || /\bfabric\b/i.test(label))) return "material";
  // "Boned bodice construction" with nothing visible named.
  if (hidden && !shape && !material) return "hidden";
  return "shape";
}
