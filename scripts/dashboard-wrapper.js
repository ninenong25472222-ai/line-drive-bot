const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "web", "dashboard.source.html");
const wrapperPath = path.join(root, "web", "index.html");

function fail(message) {
    console.error(message);
    process.exitCode = 1;
}

function extract() {
    const wrapper = fs.readFileSync(wrapperPath, "utf8");
    const match = wrapper.match(/atob\('([^']+)'\)/);

    if (match) {
        fs.writeFileSync(
            sourcePath,
            Buffer.from(match[1], "base64").toString("utf8"),
            "utf8"
        );
        return;
    }

    if (/<!doctype html/i.test(wrapper) && /<html[\s>]/i.test(wrapper)) {
        fs.writeFileSync(sourcePath, wrapper, "utf8");
        return;
    }

    return fail("Dashboard entry does not contain HTML or a supported Base64 payload.");
}

function build() {
    fs.copyFileSync(sourcePath, wrapperPath);
}

if (process.argv[2] === "extract") {
    extract();
} else if (process.argv[2] === "build") {
    build();
} else {
    fail("Use: node scripts/dashboard-wrapper.js <extract|build>");
}
