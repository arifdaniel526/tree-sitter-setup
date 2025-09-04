const TreeSitter = require('tree-sitter');
const Python = require('tree-sitter-python');
const Java = require('tree-sitter-java');
const JavaScript = require('tree-sitter-javascript');

const fs = require('fs').promises;
const path = require('path');

// map extensions to grammars
const langMap = {
    ".py": Python,
    ".java": Java,
    ".js": JavaScript,
    // ".jsx": JavaScript,
    // ".mjs": JavaScript,
    // ".cjs": JavaScript,
};

// serialize AST to JSON
function serializeNode(node, filePath, fileContent) {
    if (
        node.type === 'line_comment' ||  // Python, Java
        node.type === 'block_comment' || // Java block comments
        node.type === 'comment' ||       // JavaScript single + multi-line
        node.type === 'whitespace'
    ) {
        return null;
    }

    const startIndex = node.startIndex;
    const endIndex = node.endIndex;
    const snippet = fileContent.slice(startIndex, endIndex);

    return {
        type: node.type,
        file: filePath,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        text: snippet.trim(),
        children: (node.children || [])
            .map(child => serializeNode(child, filePath, fileContent))
            .filter(Boolean),
    };
}

// convert AST to DOT format
function astToDot(node, parentId = null, nodeIdRef = { current: 0 }, lines = []) {
    const currentId = nodeIdRef.current++;
    const label = node.type.replace(/"/g, '\\"');
    lines.push(`  node${currentId} [label="${label}"];`);
    if (parentId !== null) {
        lines.push(`  node${parentId} -> node${currentId};`);
    }
    for (const child of (node.children || [])) {
        astToDot(child, currentId, nodeIdRef, lines);
    }
    return lines;
}

// Main function
async function main(inputPath) {
    try {
        const stat = await fs.stat(inputPath);

        // verify output folder exists
        const outputDir = path.join(__dirname, "..", "Output");
        await fs.mkdir(outputDir, { recursive: true });

        let treeRoot;
        let combinedDotLines = ['digraph AST {'];
        let nodeIdRef = { current: 0 };

        // ensure file as an input
        if (stat.isFile()) {
            const ext = path.extname(inputPath).toLowerCase();
            if (!langMap[ext]) {
                console.log(`Unsupported file type: ${ext}`);
                return;
            }

            const language = langMap[ext];
            const codeContent = await fs.readFile(inputPath, 'utf8');
            const parser = new TreeSitter();
            parser.setLanguage(language);
            const tree = parser.parse(codeContent);

            const astRoot = serializeNode(tree.rootNode, inputPath, codeContent);
            if (!astRoot) return;

            treeRoot = {
                type: 'File',
                name: path.basename(inputPath),
                file: inputPath,
                children: [astRoot],
            };

            combinedDotLines.push(`subgraph cluster_${nodeIdRef.current} { label="${inputPath}";`);
            astToDot(tree.rootNode, null, nodeIdRef, combinedDotLines);
            combinedDotLines.push('}');

        } else {
            // fallback: folder as an input
            console.log("Folder input detected. Only files are supported.");
            return;
        }

        combinedDotLines.push('}');

        // write JSON output
        const jsonOutputPath = path.join(outputDir, 'project_ast.json');
        await fs.writeFile(jsonOutputPath, JSON.stringify(treeRoot, null, 2), 'utf8');
        console.log(`AST JSON exported to ${jsonOutputPath}`);

        // write DOT output
        const dotOutputPath = path.join(outputDir, 'project_ast.dot');
        await fs.writeFile(dotOutputPath, combinedDotLines.join('\n'), 'utf8');
        console.log(`AST DOT exported to ${dotOutputPath}`);

    } catch (err) {
        console.error("Error:", err);
    }
}

// CLI usage
if (process.argv.length < 3) {
    console.error("Usage: node analyze_code.js <file-path>");
    process.exit(1);
}

main(process.argv[2]);
