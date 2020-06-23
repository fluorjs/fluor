/* global describe, it, before, cy, test */

describe("f-html", () => {
  before(() => {
    cy.visit("http://localhost:5000/examples/f-html.html")
  })

  it("updates elements with a variable's contents as inner HTML", () =>
    test("simple-bind").find("b").contains("Hello, world!"))

  it("allows using dotted paths", () =>
    test("dotted-bind").find("b").contains("Hello, world!"))
})
