---
name: Aether Asset Management
colors:
  surface: '#131315'
  surface-dim: '#131315'
  surface-bright: '#39393b'
  surface-container-lowest: '#0e0e10'
  surface-container-low: '#1c1b1d'
  surface-container: '#201f22'
  surface-container-high: '#2a2a2c'
  surface-container-highest: '#353437'
  on-surface: '#e5e1e4'
  on-surface-variant: '#cbc3d7'
  inverse-surface: '#e5e1e4'
  inverse-on-surface: '#313032'
  outline: '#958ea0'
  outline-variant: '#494454'
  surface-tint: '#d0bcff'
  primary: '#d0bcff'
  on-primary: '#3c0091'
  primary-container: '#a078ff'
  on-primary-container: '#340080'
  inverse-primary: '#6d3bd7'
  secondary: '#adc6ff'
  on-secondary: '#002e6a'
  secondary-container: '#0566d9'
  on-secondary-container: '#e6ecff'
  tertiary: '#4edea3'
  on-tertiary: '#003824'
  tertiary-container: '#00a572'
  on-tertiary-container: '#00311f'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e9ddff'
  primary-fixed-dim: '#d0bcff'
  on-primary-fixed: '#23005c'
  on-primary-fixed-variant: '#5516be'
  secondary-fixed: '#d8e2ff'
  secondary-fixed-dim: '#adc6ff'
  on-secondary-fixed: '#001a42'
  on-secondary-fixed-variant: '#004395'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#131315'
  on-background: '#e5e1e4'
  surface-variant: '#353437'
typography:
  display-lg:
    fontFamily: Geist
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-mono:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  headline-md-mobile:
    fontFamily: Geist
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin-sm: 12px
  margin-md: 24px
  margin-lg: 48px
  max-width: 1440px
---

## Brand & Style

The design system is engineered for game developers who require high-performance, precision-focused interfaces to manage complex 3D and 2D pipelines. The personality is "Technical Professionalism"—a blend of minimalist utility and futuristic high-fidelity aesthetics. 

Drawing inspiration from developer-centric tools like Linear and GitHub, the style utilizes a **dark-mode-first** approach. It leans heavily into **Minimalism** with high-density layouts, while incorporating **Glassmorphism** and **Low-Contrast Outlines** to provide subtle depth without visual clutter. The interface remains unobtrusive, ensuring the user's game assets (textures, models, animations) are the focal point of the experience.

Key emotional triggers:
- **Focus:** Distraction-free environments for deep work.
- **Reliability:** Precise, grid-aligned elements that feel structurally sound.
- **Innovation:** Subtle blurs and vibrant accents that mirror high-end game engine UIs.

## Colors

The palette is built on a deep "Zinc" foundation to reduce eye strain during long development sessions. 

- **Primary (#8B5CF6):** A vibrant Violet used for primary actions, selection states, and key brand moments.
- **Secondary (#3B82F6):** A technical Blue for secondary actions, information callouts, and progress indicators.
- **Surface Tiers:** 
  - Base: `#09090B` (Deepest)
  - Surface: `#18181B` (Cards and Sidebars)
  - Overlay: `#27272A` (Hover states and Tooltips)
- **Accents:** Use Tertiary Green (`#10B981`) exclusively for success states and version control "Add" operations.
- **Borders:** Use a semi-transparent white (`rgba(255, 255, 255, 0.08)`) for a crisp, "etched" look on dark backgrounds.

## Typography

This design system uses a triple-font strategy to balance character and utility. 

1. **Geist (Headlines):** A technical sans-serif that provides a modern, high-tooling feel for titles and dashboard headers.
2. **Inter (Body):** The workhorse for UI text, offering maximum legibility at small sizes for asset names and metadata.
3. **JetBrains Mono (Labels/Code):** Used for technical metadata (file sizes, hex codes, version numbers, and file paths) to emphasize the developer-centric nature of the platform.

Keep line lengths for body text between 45-75 characters for optimal readability in documentation or asset descriptions.

## Layout & Spacing

The layout follows a **Fluid Grid** model with a hard 4px baseline rhythm. This ensures that every element, from a small icon to a large preview pane, feels mathematically aligned.

- **Desktop (1280px+):** 12-column grid. Sidebars are fixed at 240px or 280px. Main content area is fluid.
- **Tablet (768px - 1279px):** 8-column grid. Sidebars collapse into icons or hide behind a hamburger menu.
- **Mobile (Below 768px):** 4-column grid. All horizontal margins are set to `margin-md` (24px).

Spacing should be used sparingly to maintain high information density, typical of professional asset management software. Use `gutter` (16px) for card-to-card spacing in asset galleries.

## Elevation & Depth

Depth is conveyed through **Tonal Layering** and **Subtle Glassmorphism** rather than traditional heavy shadows. 

1. **The Base Layer:** Solid Zinc-950 (`#09090B`).
2. **The Surface Layer:** Zinc-900 (`#18181B`) with a 1px solid border of `rgba(255, 255, 255, 0.08)`. This is used for cards and the main dashboard body.
3. **The Floating Layer:** Used for modals and dropdowns. Use a backdrop blur of `12px` and a semi-transparent background (`rgba(24, 24, 27, 0.8)`). 
4. **Shadows:** Only used on Floating Layers. Use a single, very soft, non-tinted shadow: `0 10px 30px rgba(0, 0, 0, 0.5)`.

## Shapes

The shape language is **Soft (0.25rem)** to maintain a professional, slightly sharp edge that feels more technical and less "consumer-grade."

- **Small Components (Buttons, Inputs, Badges):** 4px (0.25rem) radius.
- **Medium Components (Cards, Modals):** 8px (0.5rem) radius.
- **Large Containers (Sections, Main Panels):** 12px (0.75rem) radius.

Avoid pill-shaped buttons except for specialized "status" chips. The squareness reinforces the grid-based, engineering-first aesthetic.

## Components

### Buttons
- **Primary:** Background `#8B5CF6`, White text. High-contrast, no shadow.
- **Secondary:** Background `rgba(255, 255, 255, 0.05)`, Border `rgba(255, 255, 255, 0.1)`, White text.
- **States:** Hover should increase background opacity or lighten the hex by 5%.

### Asset Cards
- **Structure:** 1px border, slight inner glow on hover.
- **Content:** Large image preview at the top (16:9 ratio), title in `body-md` (bold), and file type in `label-mono`.
- **Interactions:** Selection is indicated by a 2px `#8B5CF6` border.

### Input Fields
- Dark background (`#09090B`), subtle border. 
- **Focus State:** Border changes to `#3B82F6` with a `0 0 0 2px rgba(59, 130, 246, 0.2)` ring.

### Sidebar (Navigation)
- Background is a step lighter or darker than the main surface to create a clear vertical break.
- Nav items use `Inter` 14px with icons set to 18px size.
- Active state uses a vertical purple line (2px) on the far left of the item.

### Chips & Tags
- Use `JetBrains Mono` for tags. 
- Tags should be low-contrast (e.g., dark grey background with light grey text) unless they denote a specific state like "Urgent" or "Review Needed."