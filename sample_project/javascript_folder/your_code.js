// example.js

// A simple function
function greet(name) {
    const message = "Hello, " + name + "!";
    console.log(message);
    return message;
}

// A class with a method
class Calculator {
    add(a, b) {
        return a + b;
    }

    multiply(a, b) {
        return a * b;
    }
}

// Use them
greet("World");

const calc = new Calculator();
console.log("Sum:", calc.add(3, 5));
console.log("Product:", calc.multiply(4, 6));
