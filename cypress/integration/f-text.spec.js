/* global describe, it, before, cy, test */

describe("f-text", () => {
  before(() => {
    cy.visit("http://localhost:5000/examples/f-text.html")
  })

  it("updates elements with a variable's contents", () =>
    test("simple-bind").find("p").contains("Hello, world!"))

  it("allows using dotted paths", () =>
    test("dotted-bind").find("p").contains("Hello, world!"))
})
