#import "@preview/cheq:0.2.3": checklist


#let template(body) = {
  // links
  show link: set text(blue)
  show link: underline

  // inline raw
  show raw.where(block: false): box.with(
    fill: luma(240),
    inset: (x: 3pt, y: 0pt),
    outset: (y: 3pt),
    radius: 2pt,
  )

  // text
  set text(font: ("Libertinus Serif", "Noto Serif CJK SC"))
  set text(12pt)

  // cheq
  show: checklist

  body
}
