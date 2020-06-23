/* global describe, it, before, cy, test */

describe("f-each", () => {
  before(() => {
    cy.visit("http://localhost:5000/examples/f-each.html")
  })

  it("iterates over an array to create DOM elements", () =>
    test("basic-loop").find("li").should("have.length", 3))

  it("updates the list when the array changes", () => {
    test("updating-loop").within(() => {
      cy.get("li").should("have.length", 3)
      cy.get("button").click()
      cy.get("li").should("have.length", 4)
      cy.get("button").click()
      cy.get("li").should("have.length", 5)
    })
  })
})
