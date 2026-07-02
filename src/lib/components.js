// =====================================================================
//  COMPONENTS V2 — helpers
//
//  Discord "Components V2" remplace les embeds classiques par des
//  conteneurs composés de blocs (texte, séparateurs, sections, médias…).
//
//  Règles importantes :
//   - Tout message V2 DOIT porter le flag MessageFlags.IsComponentsV2 (= V2).
//   - Un message V2 ne peut PAS utiliser `content` ni `embeds` :
//     les mentions/texte passent dans des TextDisplay, et le ping se
//     contrôle via `allowedMentions`.
//   - Un conteneur a une couleur d'accent (comme la barre d'un embed).
// =====================================================================
const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SectionBuilder,
  ThumbnailBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, FileBuilder,
  SeparatorSpacingSize, MessageFlags,
} = require('discord.js');
const config = require('../../config');

// Flag à passer dans `flags` pour activer Components V2.
const V2 = MessageFlags.IsComponentsV2;

/** Conteneur avec couleur d'accent (équivalent de la barre colorée d'un embed). */
function container(color = config.brandColor) {
  const c = new ContainerBuilder();
  if (color !== null && color !== undefined) c.setAccentColor(color);
  return c;
}

/** Bloc de texte (markdown). Vide -> caractère invisible pour rester valide. */
function text(content) {
  const str = content != null && String(content).length ? String(content) : '\u200b';
  return new TextDisplayBuilder().setContent(str.slice(0, 4000));
}

/** Séparateur horizontal (petit ou grand espacement). */
function separator(large = false) {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(large ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);
}

/** Section : jusqu'à 3 lignes de texte + une vignette (image) à droite. */
function thumbSection(lines, url) {
  const s = new SectionBuilder();
  const arr = [].concat(lines).filter((l) => l != null && l !== '');
  for (const l of arr.slice(0, 3)) s.addTextDisplayComponents(text(l));
  s.setThumbnailAccessory(new ThumbnailBuilder().setURL(url));
  return s;
}

/** Section : lignes de texte + un bouton en accessoire (à droite). */
function buttonSection(lines, button) {
  const s = new SectionBuilder();
  const arr = [].concat(lines).filter((l) => l != null && l !== '');
  for (const l of arr.slice(0, 3)) s.addTextDisplayComponents(text(l));
  s.setButtonAccessory(button);
  return s;
}

/** Transforme des "champs" façon embed en texte markdown (une ligne par champ). */
function fieldsText(fields) {
  return fields.filter(Boolean).map((f) => `**${f.name}** — ${f.value}`).join('\n');
}

/** Galerie média avec une seule image (URL http ou attachment://). */
function image(url, description) {
  const item = new MediaGalleryItemBuilder().setURL(url);
  if (description) item.setDescription(description.slice(0, 256));
  return new MediaGalleryBuilder().addItems(item);
}

/** Bloc "fichier" qui affiche une pièce jointe (référencée par attachment://nom). */
function file(name) {
  return new FileBuilder().setURL(`attachment://${name}`);
}

module.exports = {
  V2, container, text, separator, thumbSection, buttonSection, fieldsText, image, file,
};
