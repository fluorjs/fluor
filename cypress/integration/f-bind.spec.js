/* global describe, it, before, cy, test*/

describe("f-bind", () => {
  before(() => {
    cy.visit("http://localhost:5000/examples/f-bind.html")
  })

  it("sets an attribute value from a variable", () => {
    test("simple-bind").find("p").should("have.data", "foo", "value")
  })

  it("allows using dotted paths", () => {
    test("dotted-bind").find("p").should("have.data", "foo", "value")
  })

  it("removes the attribute if the variable is false", () => {
    test("boolean-false-bind").find("p").should("not.have.data", "foo")
  })

  it("sets the attribute to an empty string if the variable is true", () => {
    test("boolean-true-bind").find("p").should("have.data", "foo", "")
  })

  it("sets the attribute to 'undefined' if the variable is undefined", () => {
    test("boolean-true-bind").find("p").should("have.data", "foo", "")
  })
})
