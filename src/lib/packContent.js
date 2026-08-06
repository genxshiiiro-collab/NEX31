// Rendu du contenu des packs (partagé par /studiocontent et /servercontent).
// Chaque pack devient un bloc de texte markdown : titre + éventuel rappel du
// pack précédent + liste à puces + note éventuelle.
//
// Les blocs restent bien sous les limites Discord (un TextDisplay V2 accepte
// jusqu'à 4000 caractères ; les listes de packs font quelques centaines de
// caractères). buildContentBlocks renvoie un tableau : un bloc par pack.

const MAX_BLOCK = 3900; // marge sous la limite 4000 d'un TextDisplay V2

/**
 * @param {object} category  packs.studio | packs.server
 * @returns {string[]} un bloc markdown par pack, dans l'ordre.
 */
function buildContentBlocks(category) {
  const blocks = [];
  for (const key of category.order) {
    const p = category.items[key];
    if (!p) continue;

    const lines = [`**${p.name}** · Livraison : ${p.delivery}`];
    if (p.inheritsFrom) {
      const prev = category.items[p.inheritsFrom];
      if (prev) lines.push(`-# Inclut tout le ${prev.name}, puis :`);
    }
    for (const item of p.content) lines.push(`• ${item}`);
    if (p.note) lines.push(`-# ${p.note}`);

    blocks.push(lines.join('\n').slice(0, MAX_BLOCK));
  }
  return blocks;
}

module.exports = { buildContentBlocks };
