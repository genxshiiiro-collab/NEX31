# Récapitulatif des avis — ThirtyOne Lab's

> Généré le 2026-07-13 · Serveur **31 Lab's** (`1486375983434174516`)
> Salon public des avis : `1487131838131736708`

## Synthèse

| Indicateur | Valeur |
|---|---|
| **Total avis** | **12** |
| Approuvés (publiables) | 11 |
| En attente de validation | 1 (spinkoya) |
| Note moyenne (approuvés) | **5,00 / 5** ⭐ |
| Avis « historiques » (legacy) | 7 |
| Avis créés via le bot (`/avis`) | 5 |

Deux sources cohabitent :
- **Legacy** (`db.legacyReviews`) — avis récupérés de l'ancien salon + 1 seed manuel. Publiés au démarrage par `importAndPublishLegacyReviews`.
- **Bot** (`db.reviews`) — avis passés par la commande `/avis`, validés par le staff. Publiés au clic « Valider », et rattrapés au démarrage par `publishApprovedBotReviews` si besoin.

---

## Avis historiques (legacy)

| Date | Client | Note | Prestation | Statut | Source | ID |
|---|---|---|---|---|---|---|
| 2026-03-28 | **Bozza** | 5/5 | 3 Logo & 1 Bannière | approved | seed | `legacy-bozza` |
| 2026-03-30 | **bite2lm** | 5/5 | 3 Logo | approved | channel | `msg-1487972615455772673` |
| 2026-05-17 | **user.meruem** | 5/5 | Pack 18e + logo gif | approved | channel | `msg-1505560663584542750` |
| 2026-05-19 | **kyami05_** | 5/5 | Pack basic | approved | channel | `msg-1506340620929601666` |
| 2026-06-20 | **messieurx** | 5/5 | Pack basic | approved | channel | `msg-1517810621238870136` |
| 2026-06-28 | **mio.ses** | 5/5 | Prestation graphique | approved | channel | `msg-1520882680718295171` |
| 2026-07-01 | **xin.aaq** | 5/5 | Vidéo TikTok | approved | channel | `msg-1521667329681915926` |

### Commentaires

- **Bozza** — 3 Logo & 1 Bannière — ⭐⭐⭐⭐⭐
  > Tout c'est bien passé, il a pris le temps de savoir ce que je voulais exactement au moindre détail, le rendu est magnifique vraiment comme je le souhaitais, une très bonne expérience.

- **bite2lm** — 3 Logo — ⭐⭐⭐⭐⭐
  > Incroyable, du jamais vu ! Rapide, les logos sont incroyables, franchement je vous le recommande à tous. En plus, ce n'est pas cher. Grand merci à lui !

- **user.meruem** — Pack 18e + logo gif — ⭐⭐⭐⭐⭐
  > Très pro et rapide je recommande Merci

- **kyami05_** — Pack basic — ⭐⭐⭐⭐⭐
  > Très pro je recommande fortement

- **messieurx** — Pack basic — ⭐⭐⭐⭐⭐
  > Très pro qualité au top rien a redire un grand merci a toi

- **mio.ses** — Prestation graphique — ⭐⭐⭐⭐⭐
  > Franchement le meilleur graphiste que j'ai jamais vu. il compte pas ses heures, il bosse jusqu'à ce que ce soit parfait. Hyper humble avec ça, bon délire, il capte direct ce que tu veux sans que t'aies à répéter 10 fois. Si vous hésitez, foncez les yeux fermés, vous serez pas déçus. Un grand merci à toi. LE GOAT DE L'ANNEE

- **xin.aaq** — Vidéo TikTok — ⭐⭐⭐⭐⭐
  > Personne humble avec une réel intention de vous satisfaire. Sans forcément allumer sur les prix comme beaucoup d'autre ce permettrai. Je recommande et je vous invite à lui faire confiance pour vos différentes demandes. Merci encore pour ton boulot.

---

## Avis via le bot (`/avis`)

| # | Date | Client | Note | Prestation | Statut | ID Discord |
|---|---|---|---|---|---|---|
| 1 | 2026-07-06 | **69peke** | 5/5 | Logo & Bannière | approved | `1485333548125786172` |
| 2 | 2026-07-07 | **mrpoulpiii** | 5/5 | Pack Complet | approved | `725444459826905109` |
| 3 | 2026-07-08 | **sqlx_xx** | 5/5 | Logo, Bannière | approved | `1168194539190755389` |
| 4 | 2026-07-09 | **spinkoya** | 5/5 | Logo et bannière | ⏳ **pending** | `1436997129913761903` |
| 5 | 2026-07-10 | **Nacros** | 5/5 | logo, bannière | approved | `1479590384957919282` |

### Commentaires

- **#1 · 69peke** — Logo & Bannière — ⭐⭐⭐⭐⭐ — *approved*
  > Magnifique, je recommande livrée en temps & en heure. Au top

- **#2 · mrpoulpiii** — Pack Complet — ⭐⭐⭐⭐⭐ — *approved*
  > Propre de fou délais rapide c'est vraiment propre !

- **#3 · sqlx_xx** — Logo, Bannière — ⭐⭐⭐⭐⭐ — *approved*
  > je recommande fort prend en charge vos commande rapidement et pas chère pour le taff qu'il fait

- **#4 · spinkoya** — Logo et bannière — ⭐⭐⭐⭐⭐ — ⏳ *pending (à valider par le staff)*
  > Rien à dire travaille parfait, livraison ULTRA VITE, qualité 10/10 et franchement il est super gentil !

- **#5 · Nacros** — logo, bannière — ⭐⭐⭐⭐⭐ — *approved*
  > Que dire de plus qie magnifique ! Il repond a vos questions et est très professionnel. Un des meilleurs que je connais !

---

## À retenir

- **spinkoya (#4)** est le seul avis non publié : il attend la validation staff (bouton « Valider & publier »).
- Tous les avis approuvés non encore postés dans le salon sont **publiés automatiquement au prochain démarrage** du bot (filet de sécurité `publishApprovedBotReviews`, anti-doublon inclus).
- Note moyenne parfaite : **5,00/5 sur 11 avis approuvés**.
