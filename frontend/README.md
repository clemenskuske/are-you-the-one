# Matching algorithm

The basic rules are in `src/features/matching/match-count-rules.ts`. The board applies
these rules to a fixed point before testing hypothetical outcomes. Use
`deriveBasicMatchBoardState` to run only the basic deductions.

## Season constraints

The complete cast and the active partner pool are separate. Contestants attached
to a resolved shared match remain in the board history and retain their forced
pairing, but no longer occupy an active partner slot. Partner capacities use the
active counts. Equal total cast sizes can therefore still require a double match.

- With equal active group sizes, each active contestant has one active partner.
- With one extra active contestant, exactly one person on the smaller active side
  has two active partners; everyone else has one. Historical shared partners add
  their separate, already resolved pairing to these requirements.
- A **Known double-match participant** can be selected before their partners are
  known. A contestant on the smaller active side has two partners. A contestant on
  the larger active side must share their partner with another contestant. Both
  the capacity checks and joint solver enforce this fact; selecting someone never
  picks a partner automatically. Manual selections are saved in the URL and can
  be cleared. Historical resolved shared matches remain separate.
- Stored `added-to-match` records are known season facts and are kept in
  `knownAddedToMatches`. A new user selection is stored separately in
  `addedToMatch` and remains an expectation. Removing that selection preserves
  the historical shared matches.
- In the saved 2026 VIP data, Janice joins Marta + Johannes from night 3. Once
  Laurenz appears, the full cast has 11 women and 11 men, while the active partner
  pool has 10 women and 11 men. Johannes retains his historical second partner,
  and one active woman can also have two partners.
- Laurenz is a confirmed participant in the 2026 VIP double match from night 5.
  The board loads this season fact automatically when he is in the active cast.
  It cannot be cleared or replaced by a saved manual selection. His partner and
  the other sharing contestant remain open until the evidence determines them.
  Season facts are configured in `src/features/matching/season-rules.ts`.
- A Matching Night has exactly its reported number of matches. Count each pair
  once, including positive Match-Box results already confirmed by that night when
  omitted from its lineup. Future, expected, or merely inferred Match-Box outcomes
  do not add a hidden match.
- Unpaired contestants inherit their side from season pair metadata, rather than
  all being assigned to the women's group. Future results are not loaded by this
  side lookup.

## Basic deductions

1. **Added contestant:** derive the shared pair and exclude the added contestant's
   other partners. Stored resolved moves are facts; user selections are conditional.
2. **Night filled:** once positive pairs fill the reported total, every other
   pair in that night is a no-match.
3. **Night needs every remaining pair:** when the number of possible pairs equals
   the reported total, every possible pair is a match.
4. **Partner capacity filled:** once someone has their allowed number of partners,
   exclude every other pairing for that person. Account for the double-match slot
   in uneven seasons.
5. **All remaining partners required:** when someone's possible partners equal
   their required partner count, all those pairings are matches.

Evaluate confirmed facts first. Use expected outcomes only when needed, and mark
any dependent conclusion as expected. An independent proof from confirmed facts
can upgrade a derived expected outcome. Explicit facts and user expectations stay
unchanged. Deductions may resolve an undefined pair or increase its certainty;
conflicting rules never reverse an outcome. Stop propagation when a night or a
person's partner counts contradict the current inputs. Removing a user expectation
clears derived outcomes and recomputes them from the remaining inputs.

The fast trial-assumption pass still checks necessary bounds and assignment
capacity. The asynchronous solver in `match-solver.ts` additionally checks all
nights and partner degrees jointly. It runs in the background to detect combined
contradictions, which appear in a fixed alert that remains visible when scrolling.

**Load all forced pairs** finds every unresolved pairing whose opposite outcome
has no complete assignment. Confirmed outcomes (including confirmed deductions)
and already saved expectations are skipped. Conditional deductions can still be
saved. All new expected matches and no-matches are applied in one board update
and persisted in the URL.
Derived conclusions are excluded from the solver's premises to avoid circular
proofs. An inconsistent board, cancellation, or exhausted search budget never
adds decisions, including a partially searched batch. Searches cancel when the
season, cutoff, or expectations change.

Run `npm test`, `npm run lint`, and `npm run build` to check changes.

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is enabled on this template. See [this documentation](https://react.dev/learn/react-compiler) for more information.

Note: This will impact Vite dev & build performances.

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
