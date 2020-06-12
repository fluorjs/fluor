/* global describe, it, beforeEach, cy */

describe("f-text", () => {
  beforeEach(() => {
    cy.visit("http://localhost:5000/examples/f-text.html")
  })

  it("updates elements with a variable's contents", () => {
    cy.get("[data-test-ref='simple-bind']").then(() => {
      cy.contains("Hello, world!")
    })
  })

  it("allows using dotted paths", () => {
    cy.get("[data-test-ref='dotted-bind']").then(() => {
      cy.contains("Hello, world!")
    })
  })
})
