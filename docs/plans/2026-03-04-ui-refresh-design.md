# Knowtis UI Refresh — "Clean & Focused"

**Date**: 2026-03-04
**Status**: Approved
**Scope**: Partial redesign — notes list, editor, mobile navigation, welcome page

## Design Philosophy

> "El contenido es el protagonista."

Every UI decision reduces visual noise and maximizes space for writing and reading. Inspired by Notion, Linear, and iA Writer — clean, focused, typography-driven interfaces where the UI disappears when you're working.

**Core principle**: Clean by default, depth on interaction.

---

## 1. Visual System Refinements

### Typography

| Element            | Current         | New                                                       |
| ------------------ | --------------- | --------------------------------------------------------- |
| H1 (page titles)   | Inter Bold 36px | Inter Semi-Bold 32px (28px mobile), letter-spacing 0.02em |
| H2 (section heads) | -               | Inter Semi-Bold 24px (20px mobile)                        |
| Body / Editor      | 16px            | 16px, line-height 1.7 for readability                     |
| Meta / timestamps  | 14px            | 13px, text-muted-foreground/70                            |
| Note card title    | Inter Bold      | Inter Semi-Bold 16px                                      |

### Color

| Token          | Current               | New                                                  |
| -------------- | --------------------- | ---------------------------------------------------- |
| Background     | `#ffffff`             | `#fafaf9` (warm white, `stone-50`)                   |
| Card surface   | `bg-card` with border | `bg-background` no border, `shadow-sm` on hover only |
| Borders        | `border-border`       | `border-border/30` (subtle) or none                  |
| Purple accent  | Primary everywhere    | Reduced to: active states, links, brand mark, FAB    |
| Text primary   | `foreground`          | No change                                            |
| Text secondary | `muted-foreground`    | `muted-foreground/70` for less noise                 |

### Depth & Shadows

- **Default state**: No borders, no shadows on cards. Separation via spacing and subtle background differences
- **Hover state**: `shadow-sm` with subtle scale (`scale(1.01)`)
- **Active/Focus state**: Purple ring (`ring-primary/30`)
- **Frosted surfaces**: `backdrop-blur-xl` on sidebar, search bar, floating toolbar (already partially implemented)

### Spacing

- Mobile padding: `p-4` → `p-5` (20px)
- Desktop content: `max-w-2xl` centered (editor prose width)
- Section gaps: `gap-6` → `gap-8` between major sections
- Card gaps: `gap-4` maintained

---

## 2. Mobile — Notes List (Priority: HIGH)

### Current Problems

- Cards are tall (~140px), only 3-4 visible on screen
- Delete button always visible (visual noise)
- No gesture interactions
- "New Note" button in top-right, not thumb-friendly

### New Design: Compact Row Layout

```
┌─────────────────────────────────┐
│ 🔍 Search notes...        (blur)│  ← Sticky, hides on scroll-down
├─────────────────────────────────┤
│                                 │
│ Fixes                           │
│ La versión mobile no están...   │  ← Row height: ~72px
│ Today at 3:48 PM                │  ← Muted, 13px
│─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │  ← Subtle divider
│                                 │
│ Nuevo identidad                 │
│ Con un nuevo purpura para...    │
│ Today at 3:48 PM                │
│─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│                                 │
│ AI note                         │
│ La AI juega un rol importante...│
│ Today at 1:49 PM                │
│                                 │
│          ... more notes ...      │
│                                 │
│                           ┌───┐ │
│                           │ + │ │  ← FAB (purple, bottom-right)
│                           └───┘ │
├─────────────────────────────────┤
│  🏠 Home    📝 Notes   ⚙ Settings│  ← Bottom nav (refined)
└─────────────────────────────────┘
```

### Interactions

- **Swipe right** → Favorite/pin (optional, future)
- **Swipe left** → Delete with confirmation
- **Long press** → Multi-select mode
- **Pull to refresh** → Sync notes
- **FAB**: Purple circle `+` button, `bottom-6 right-5`, with `shadow-lg`
- **Search**: `position: sticky`, backdrop-blur, collapses on scroll-down, shows on scroll-up

### Transition to Editor

- Full-screen **slide-left** transition
- Shared element transition on the note title (title animates from list position to editor position)
- Duration: 300ms, ease-out

---

## 3. Mobile — Editor (Focus Mode) (Priority: HIGH)

### Current Problems

- Fixed toolbar at bottom takes space
- Title has input styling (feels form-like, not document-like)
- "Last updated" always visible
- No slash commands or advanced formatting

### New Design: Distraction-Free Writing

```
┌─────────────────────────────────┐
│ ←                          Share │  ← Minimal header, fades on scroll
│                                 │
│                                 │
│ Fixes                           │  ← Large, bold, no border
│                                 │  ← Title = contentEditable div
│ · La versión mobile no están    │
│   fluida                        │
│ · La sesión no se mantiene      │
│   abierta tanto tiempo...       │
│                                 │
│                                 │
│                                 │  ← Generous whitespace
│                                 │
│                                 │
│                                 │
│                                 │
│                                 │
│                                 │
│                                 │
├─────────────────────────────────┤
│ ↩ ↪  B I U  ≡  /  ✓ Saved     │  ← Keyboard accessory bar
└─────────────────────────────────┘
```

### Key Changes

1. **No fixed toolbar**: Formatting appears as floating pill when text is selected
2. **Floating toolbar**: `backdrop-blur-xl`, rounded-full, appears above selection with B/I/U/Link/H1/H2/Quote
3. **Slash commands** (`/`): Bottom sheet with block options (Heading, List, Quote, Divider, Code)
4. **Title**: Large (28px), Semi-Bold, no border, no background — feels like writing directly on paper
5. **Metadata hidden**: "Last updated" accessible via tap on header or swipe-down gesture
6. **Keyboard accessory bar**: Slim strip above keyboard with undo/redo, quick format buttons, save status
7. **Header fade**: Back button and Share fade out after 2s of typing, reappear on scroll-up or tap top area
8. **Safe areas**: Proper `env(safe-area-inset-*)` for notch and home indicator

---

## 4. Desktop — Sidebar & Layout (Priority: MEDIUM)

### Sidebar Refinements

| Aspect         | Current                         | New                                               |
| -------------- | ------------------------------- | ------------------------------------------------- |
| Width          | `w-56` (224px)                  | `w-60` (240px)                                    |
| Section labels | "NOTES", "FLASHCARDS" uppercase | Remove labels, group with spacing                 |
| Note items     | Bullet icon + title             | Title only, `pl-3`, subtle left-border on active  |
| Active state   | `bg-accent`                     | `bg-accent/50` with `border-l-2 border-primary`   |
| Hover state    | -                               | `bg-accent/30`                                    |
| User menu      | Bottom, avatar + name + chevron | Top of sidebar, avatar + name inline              |
| Collapse       | Not implemented                 | `Cmd+\` shortcut, click on edge, or toggle button |

### Content Area

- Editor: `max-w-2xl` (`672px`) centered — optimal line length for reading (~65 characters)
- Background: `bg-stone-50/50` on editor zone (subtle warmth)
- Header: Simplified breadcrumb: `Notes / [Note Title]` replacing "Back to Notes" button
- Save status: Moved inline with breadcrumb (right side)

---

## 5. Welcome Page Redesign (Priority: LOW)

### Current State

Two large feature cards (Notes + Flashcards "coming soon"). Feels empty and template-like.

### New Design

```
Welcome back, Jovan                  ← Contextual greeting (time of day)

Quick Actions
┌──────────────┐ ┌──────────────────┐
│  + New Note  │ │ ▶ Continue: Fixes│  ← Resume last edited note
└──────────────┘ └──────────────────┘

Recent Notes
─────────────────────────────────────
Fixes                    Today 3:48 PM
Nuevo identidad          Today 3:48 PM
AI note                  Today 1:49 PM
Knowtis ideas        Today 12:46 AM
Emprendimientos      Today 12:46 AM
─────────────────────────────────────
```

### Changes

- **Contextual greeting**: "Good morning/afternoon/evening, [Name]"
- **Quick actions**: 2 buttons — "New note" + "Continue editing [last note]"
- **Recent notes**: Compact list (same row style as notes list), showing last 5
- **Remove**: Feature cards, "What would you like to work on today?" text
- **No Flashcards section** until actually implemented

---

## 6. Implementation Priorities

### Phase 1: Mobile Core (HIGH)

1. Compact note list rows (replace cards)
2. FAB for new note creation
3. Editor focus mode (floating toolbar, clean title)
4. Slide transitions between views

### Phase 2: Visual Polish (HIGH)

5. Warm white background + reduced borders
6. Typography scale refinement
7. Refined sidebar (desktop)
8. Search bar with blur + auto-hide

### Phase 3: Interactions (MEDIUM)

9. Swipe gestures on note rows
10. Slash commands (`/`) in editor
11. Keyboard accessory bar (mobile)
12. Sidebar collapse (desktop)

### Phase 4: Welcome & Polish (LOW)

13. Welcome page redesign
14. Shared element transitions
15. Pull to refresh

---

## Design References

- **Notion mobile**: Content-first cards, slash commands, floating toolbar
- **Linear**: Clean typography, full-screen transitions, minimal chrome
- **iA Writer**: Focus mode, typography-driven, distraction-free
- **Apple Notes**: Bottom sheet actions, swipe gestures, native feel
- **Bear**: Warm aesthetics, compact list view

## Research Sources

- [Minimalist UI Design in 2026](https://www.anctech.in/blog/explore-how-minimalist-ui-design-in-2026-focuses-on-performance-accessibility-and-content-clarity-learn-how-clean-interfaces-subtle-interactions-and-data-driven-layouts-create-better-user-experie/)
- [8 Minimalist UI Design Trends 2026](https://www.sanjaydey.com/minimalist-ui-design-clean-website-design-web-trends-2026/)
- [Mobile Navigation UX Best Practices 2026](https://www.designstudiouiux.com/blog/mobile-navigation-ux/)
- [Bottom Sheets UX Guidelines — NN/g](https://www.nngroup.com/articles/bottom-sheet/)
- [Mobile Navigation Patterns 2026](https://phone-simulator.com/blog/mobile-navigation-patterns-in-2026/)
- [Note Taking App Market Trends 2026](https://codewave.com/insights/note-taking-app-market-trends-analysis/)
- [12 UI/UX Design Trends 2026](https://www.index.dev/blog/ui-ux-design-trends)
