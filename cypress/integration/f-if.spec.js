/* global describe, it, before, cy, test */

describe("f-if", () => {
  before(() => {
    cy.visit("http://localhost:5000/examples/f-if.html")
  })

  it("does not show the template contents if the variable is false", () =>
    test("if-false").find("p").should("not.be.visible"))

  it("does not show the template contents if the variable is falsy", () =>
    test("if-falsy").find("p").should("not.be.visible"))

  it("shows the template contents if the variable is true", () =>
    test("if-true").find("p"))

  it("shows the template contents if the variable is truthy", () =>
    test("if-truthy").find("p"))

  it("updates with data updates", () => {
    test("updates").within(() => {
      cy.get("p").should("not.be.visible")
      cy.get("button").click()
      cy.get("p").should("be.visible")
      cy.get("button").click()
      cy.get("p").should("not.be.visible")
    })
  })
})
