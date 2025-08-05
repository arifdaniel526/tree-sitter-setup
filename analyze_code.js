const TreeSitter = require('tree-sitter');
const Python = require('tree-sitter-python');
const Java = require('tree-sitter-java');
const fs = require('fs').promises;
const path = require("path");

// tree parse logic
async function parseCode(codePath) {
    // Load the Python parser
    const parser = new TreeSitter();
    // Set the language to the parser
    parser.setLanguage(Java);
    // Read the code file content
    const codeContent = await fs.readFile(codePath, 'utf8');
    // Parse the code using the chosen parser
    const tree = parser.parse(codeContent);
    // console.log(tree.toString());
    return tree.rootNode;
}

// print AST
async function printASTNodeInfo(rootNode) {
    console.log(`Node type: ${rootNode.type}`);
    // Loop through child nodes
    for (const child of rootNode.children) {
        console.log(`  - Child node type: ${child.type}`);
        // Explore child nodes recursively
        if (child.children.length > 0) {
            await printASTNodeInfo(child);
        } else {
            // For leaf nodes (no children), print the text content
            if (child.text) {
                console.log(`    - Text content: ${child.text}`);
            }
        }
    }
}

// covert ast to JSON
function serializeNode(node) {
    return {
        type: node.type,
        startPosition: node.startPosition,
        endPosition: node.endPosition,
        text: node.text,
        children: node.children.map(serializeNode),
    };
}

// convert AST to DOT graph format
function astToDot(node, parentId = null, nodeIdRef = { current: 0 }, lines = []) {
    const currentId = nodeIdRef.current++;
    const label = node.type.replace(/"/g, '\\"');

    lines.push(`  node${currentId} [label="${label}"];`);

    if (parentId !== null) {
        lines.push(`  node${parentId} -> node${currentId};`);
    }

    for (const child of node.children) {
        astToDot(child, currentId, nodeIdRef, lines);
    }

    return lines;
}



// main function
async function main(codePath) {
    try {
        const rootNode = await parseCode(codePath);

        // console.log AST
        await printASTNodeInfo(rootNode);

        // Export JSON
        const astJson = JSON.stringify(serializeNode(rootNode), null, 2);
        const outputPath = path.join(__dirname, "ast_output.json");
        await fs.writeFile(outputPath, astJson, "utf8");
        console.log(`\nAST exported to ${outputPath}`);

        // Export DOT
        const dotLines = ['digraph AST {'];
        dotLines.push(...astToDot(rootNode));
        dotLines.push('}');
        const dotOutputPath = path.join(__dirname, "ast_output.dot");
        await fs.writeFile(dotOutputPath, dotLines.join('\n'), "utf8");
        console.log(`\nDOT AST exported to ${dotOutputPath}`);

    } catch (error) {
        console.error(`Failed to parse code: ${error.message}`);
    }
}

// Call the main function
main("your_code.java");