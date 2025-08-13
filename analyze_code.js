// const TreeSitter = require('tree-sitter');
// const Python = require('tree-sitter-python');
// const Java = require('tree-sitter-java');
// const fs = require('fs').promises;
// const path = require("path");

// // tree parse logic
// async function parseCode(codePath) {
//     // Load the Python parser
//     const parser = new TreeSitter();
//     // Set the language to the parser
//     parser.setLanguage(Java);
//     // Read the code file content
//     const codeContent = await fs.readFile(codePath, 'utf8');
//     // Parse the code using the chosen parser
//     const tree = parser.parse(codeContent);
//     // console.log(tree.toString());
//     return tree.rootNode;
// }

// // print AST
// async function printASTNodeInfo(rootNode) {
//     console.log(`Node type: ${rootNode.type}`);
//     // Loop through child nodes
//     for (const child of rootNode.children) {
//         console.log(`  - Child node type: ${child.type}`);
//         // Explore child nodes recursively
//         if (child.children.length > 0) {
//             await printASTNodeInfo(child);
//         } else {
//             // For leaf nodes (no children), print the text content
//             if (child.text) {
//                 console.log(`    - Text content: ${child.text}`);
//             }
//         }
//     }
// }

// // covert ast to JSON
// function serializeNode(node) {
//     return {
//         type: node.type,
//         startPosition: node.startPosition,
//         endPosition: node.endPosition,
//         text: node.text,
//         children: node.children.map(serializeNode),
//     };
// }

// // convert AST to DOT graph format
// function astToDot(node, parentId = null, nodeIdRef = { current: 0 }, lines = []) {
//     const currentId = nodeIdRef.current++;
//     const label = node.type.replace(/"/g, '\\"');

//     lines.push(`  node${currentId} [label="${label}"];`);

//     if (parentId !== null) {
//         lines.push(`  node${parentId} -> node${currentId};`);
//     }

//     for (const child of node.children) {
//         astToDot(child, currentId, nodeIdRef, lines);
//     }

//     return lines;
// }



// // main function
// async function main(codePath) {
//     try {
//         const rootNode = await parseCode(codePath);

//         // console.log AST
//         await printASTNodeInfo(rootNode);

//         // Export JSON
//         const astJson = JSON.stringify(serializeNode(rootNode), null, 2);
//         const outputPath = path.join(__dirname, "ast_output.json");
//         await fs.writeFile(outputPath, astJson, "utf8");
//         console.log(`\nAST exported to ${outputPath}`);

//         // Export DOT
//         const dotLines = ['digraph AST {'];
//         dotLines.push(...astToDot(rootNode));
//         dotLines.push('}');
//         const dotOutputPath = path.join(__dirname, "ast_output.dot");
//         await fs.writeFile(dotOutputPath, dotLines.join('\n'), "utf8");
//         console.log(`\nDOT AST exported to ${dotOutputPath}`);

//     } catch (error) {
//         console.error(`Failed to parse code: ${error.message}`);
//     }
// }

// // Call the main function
// main("your_code.java");

const TreeSitter = require('tree-sitter');
const Python = require('tree-sitter-python');
const Java = require('tree-sitter-java');
const fs = require('fs').promises;
const path = require('path');

// Map extensions to grammars
const langMap = {
    '.py': Python,
    '.java': Java
};

// Recursively get all files in a directory
async function getAllFiles(dir) {
    let files = [];
    const items = await fs.readdir(dir, { withFileTypes: true });
    for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
            files = files.concat(await getAllFiles(fullPath));
        } else {
            files.push(fullPath);
        }
    }
    return files;
}

// Parse code and return AST root node
async function parseCode(codePath, language) {
    const parser = new TreeSitter();
    parser.setLanguage(language);
    const codeContent = await fs.readFile(codePath, 'utf8');
    const tree = parser.parse(codeContent);
    return tree.rootNode;
}

// Serialize AST to JSON
function serializeNode(node, filePath) {
    if (node.type === 'comment' || node.type === 'string' || node.type === 'whitespace') {
        return null;
    }
    return {
        type: node.type,
        file: filePath,
        startLine: node.startPosition.row + 1, // Tree-sitter is 0-indexed
        startCol: node.startPosition.column + 1,
        endLine: node.endPosition.row + 1,
        endCol: node.endPosition.column + 1,
        children: node.children.map(child => serializeNode(child, filePath)).filter(Boolean),
    };
}

// Convert AST to DOT format
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

// Main function
async function main(projectPath) {
    try {
        const files = await getAllFiles(projectPath);
        const supportedFiles = files.filter(f => langMap[path.extname(f)]);

        if (supportedFiles.length === 0) {
            console.log("No supported files found.");
            return;
        }

        // Ensure Output folder exists
        const outputDir = path.join(__dirname, "Output");
        await fs.mkdir(outputDir, { recursive: true });

        let combinedAstJson = []; //JSON storage
        let combinedDotLines = ['digraph AST {']; //DOT storage
        let nodeIdRef = { current: 0 };

        for (const file of supportedFiles) {
            const ext = path.extname(file);
            const language = langMap[ext];

            const rootNode = await parseCode(file, language);
            combinedAstJson.push({
                file: file,
                ast: serializeNode(rootNode, file)
            });


            combinedDotLines.push(`subgraph cluster_${nodeIdRef.current} { label="${file}";`);
            astToDot(rootNode, null, nodeIdRef, combinedDotLines);
            combinedDotLines.push('}');
        }

        combinedDotLines.push('}');

        // Write JSON output
        const jsonOutputPath = path.join(outputDir, 'project_ast.json');
        await fs.writeFile(jsonOutputPath, JSON.stringify(combinedAstJson, null, 2), 'utf8');
        console.log(`AST JSON exported to ${jsonOutputPath}`);

        // Write DOT output
        const dotOutputPath = path.join(outputDir, 'project_ast.dot');
        await fs.writeFile(dotOutputPath, combinedDotLines.join('\n'), 'utf8');
        console.log(`AST DOT exported to ${dotOutputPath}`);

        const { exec } = require('child_process');

        // After writing DOT:
        exec(`dot -Tpng ${dotOutputPath} -o ${path.join(outputDir, 'project_ast.png')}`, (err) => {
            if (err) {
                console.error('Graphviz PNG export failed. Make sure Graphviz is installed.');
            } else {
                console.log(`AST PNG exported to ${path.join(outputDir, 'project_ast.png')}`);
            }
        });

    } catch (err) {
        console.error("Error:", err);
    }
}

// CLI usage
if (process.argv.length < 3) {
    console.error("Usage: node analyze_code.js <project-folder-path>");
    process.exit(1);
}

// Execute main function
main(process.argv[2]);
