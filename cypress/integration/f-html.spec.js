/* global describe, it, beforeEach, cy */

describe("f-html", () => {
  beforeEach(() => {
    cy.visit("http://localhost:5000/examples/f-html.html")
  })

  it("updates elements with a variable's contents as innerHTML", () => {
    cy.get("[data-test-ref='simple-bind']").then(() => {
      cy.get("b").then(() => cy.contains("Hello, world!"))
    })
  })

  it("allows using dotted paths", () => {
    cy.get("[data-test-ref='dotted-bind']").then(() => {
      cy.get("b").then(() => cy.contains("Hello, world!"))
    })
  })
})
