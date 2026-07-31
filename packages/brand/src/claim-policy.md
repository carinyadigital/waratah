# Claim policy

**CNT02-02.** The categories we never assert without a primary source, and the claims we never make at all. The prohibition gate and the freshness invariants read the machine block below; humans read the prose. One file, one truth.

ACCC guidance on environmental and sustainability claims is live and applies directly to regenerative land claims. `mustNotClaim` asserts; it does not protect — anything with regulatory exposure still needs a human who knows the rules (design.md §12).

## Never claimed, full stop

These do not get a source because they do not get said. The gate fails any document matching them, annotated or not.

- **Carbon neutrality or net zero** — we have no certified accounting and will not imply it.
- **Certified organic** — we are not certified. "Organic practices" without certification is exactly the claim the ACCC pursues.
- **Chemical-free / pesticide-free** as absolutes — unfalsifiable and misleading.
- **Unqualified "sustainable" / "eco-friendly" / "environmentally friendly"** — the ACCC's canonical greenwashing patterns.
- **Health cures** — food that treats, cures or prevents any disease or condition.
- **Zero-impact farming** — all farming has impact; ours aims to be net-restorative and we prove it with measurements or say nothing.

## Never asserted without a primary source

Claims matching these categories must be annotated (a Lexical `claim` node) and resolve to a pack entry whose source is a primary source within the category's age limit. Age limits are enforced weekly by `content-monitor` (CNT09-07).

| Category | Covers | Max source age |
|---|---|---|
| `environmental-outcome` | Soil carbon, sequestration, biodiversity, water quality, revegetation outcomes on our land | 12 months |
| `nutrition` | Nutrient density, omega-3, vitamin/mineral content, "healthier than" comparisons | 24 months |
| `animal-welfare` | Grass-fed, free-range, antibiotic and hormone claims | 12 months |
| `provenance` | Origin, "100% …", awards, firsts, certifications we do hold | 24 months |

A primary source is the measurement, the certificate, the register entry, or the peer-reviewed study — not a news story about one.

## Machine block

```yaml
prohibited:
  - id: carbon-neutral
    pattern: 'carbon[ -]?(neutral|negative|positive)|net[ -]?zero'
    reason: No certified carbon accounting. ACCC greenwashing exposure.
  - id: certified-organic
    pattern: 'certified[ -]organic|organically[ -]certified'
    reason: Not certified. Do not imply certification.
  - id: chemical-free
    pattern: '(chemical|pesticide|toxin)[ -]free'
    reason: Absolute claims are unfalsifiable and misleading.
  - id: unqualified-sustainable
    pattern: '\b(eco[ -]?friendly|environmentally[ -]friendly|100%[ -]sustainable|fully[ -]sustainable)\b'
    reason: ACCC canonical greenwashing patterns.
  - id: health-cure
    pattern: '\b(cures?|treats?|prevents?|heals?)\b[^.]{0,40}\b(disease|cancer|diabetes|arthritis|illness|condition)\b'
    reason: Therapeutic claims about food.
  - id: zero-impact
    pattern: 'zero[ -]impact|no[ -]impact farming'
    reason: All farming has impact.

categories:
  - id: environmental-outcome
    maxSourceAgeMonths: 12
    patterns:
      - 'soil (organic )?carbon'
      - 'carbon sequest\w+'
      - 'biodiversity (gain|increase|improv\w+|return\w*)'
      - '(water|riparian) (quality|health) (improv\w+|recover\w+)'
      - '(restored|regenerated|rehabilitated) [^.]{0,30}(hectare|paddock|creek|soil)'
  - id: nutrition
    maxSourceAgeMonths: 24
    patterns:
      - 'nutrient[ -]dense'
      - 'nutrient density'
      - 'omega[ -]?3'
      - '(higher|richer|more) in (vitamin|mineral|antioxidant)\w*'
      - 'healthier than'
  - id: animal-welfare
    maxSourceAgeMonths: 12
    patterns:
      - 'grass[ -]fed'
      - 'free[ -]range'
      - '(no|without|free (of|from)) (added )?(antibiotic|hormone)s?'
      - 'hormone[ -]free|antibiotic[ -]free'
  - id: provenance
    maxSourceAgeMonths: 24
    patterns:
      - '100% [a-z]+'
      - 'award[ -]winning'
      - 'first [^.]{0,30} in (australia|nsw|the hunter)'
```
