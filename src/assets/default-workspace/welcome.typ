#import "@preview/tiaoma:0.3.0"

// https://github.com/ParaN3xus/typst-snippets/tree/main/welcome

#let welcome() = (
  [
    #set text(font: ("Libertinus Serif", "Noto Serif CJK SC"), size: 60pt, lang: "zh")
    #show strong: set text(weight: "bold")
    #let watermark(c) = text(fill: black.transparentize(94%), weight: "bold", c)

    #let bar-w = 240pt
    #let bar-window = 120pt

    #show link: it => {
      show underline: it => it.body
      set text(black)
      it
    }
    #set page(
      margin: (top: 60pt, bottom: 60pt, left: 60pt),
      background: (
        place(
          right + top,
          dx: bar-window,
          rect(
            fill: gradient.linear(
              rgb(50, 143, 195),
              rgb(42, 170, 165),
              rgb(30, 179, 180),
            ),
            height: 100%,
            width: bar-w,
          ),
        )
      ),
    )

    #let typst(size: 1.5em) = text(
      font: "Buenard",
      fill: rgb("3D96A9"),
      weight: "bold",
      size: size,
      "typst",
    )

    #{
      set text(size: 60pt, fill: white)
      let common-x = -bar-w + bar-window + 3pt
      place(top + right, dx: 3.15em + common-x, dy: -0.18em, rotate(90deg, text(size: 1.5em, region: "hk")[*囯內*]))
      place(bottom + right, dx: 4.664em + common-x, dy: -1.5em, rotate(90deg, text(size: 1.5em)[*Welcome*]))
    }

    #{
      show: strong

      place(
        bottom + center,
        dx: bar-window - 56pt,
        dy: -230pt,
        rotate(
          -30deg,
          image("typst-guy.svg", width: 150pt, format: "svg"),
        ),
      )

      let cname = context {
        let r = page.width - bar-w + bar-window - page.margin.left * 2
        let w = measure(username).width
        if (w > r) {
          box(
            scale(
              x: r / w * 100%,
              origin: left,
              box(username, width: w),
            ),
          )
        } else {
          username
        }
      }

      [
        #v(0.5em)
        欢迎加入
        #v(-0.7em)
        #link("https://qm.qq.com/q/lGxOXTQf8A")[
          #typst()
          #box(text(size: 0.35em, "非官方".clusters().map(x => [#x #v(-0.9em)]).join()) + v(0.06em))
          #v(-0.44em)
          中文交流群
        ]
      ]
    }

    #v(2.7em)

    #{
      set text(size: 0.3em)
      set enum(
        numbering: x => {
          let t = numbering("1.", x)
          text(baseline: 0.1em, t)
        },
      )
      [
        = 入群须知
        教程和常见问题见群公告

        = 友链
        #{
          let groups = (
            ("https://t.me/typst_zh", "Telegram群"),
            ("https://qm.qq.com/q/gYgU5vgbRK", "off-topic群"),
            ("https://qm.qq.com/q/FuRvQHGQU0", "开发者群"),
          )
          grid(
            columns: groups.len(),
            column-gutter: 1em,
            row-gutter: 0.5em,
            align: center,
            ..{
              groups.map(x => tiaoma.qrcode(x.first(), width: 5.9em)) + groups.map(x => x.last())
            }
          )
        }
      ]
    }
  ]
)
