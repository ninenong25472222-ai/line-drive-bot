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

    if (!match) {
        return fail("Dashboard wrapper does not contain a Base64 payload.");
    }

    fs.writeFileSync(
        sourcePath,
        Buffer.from(match[1], "base64").toString("utf8"),
        "utf8"
    );
}

function build() {
    const source = fs.readFileSync(sourcePath, "utf8");
    const payload = Buffer.from(source, "utf8").toString("base64");
    const wrapper = "<!doctype html><meta charset=\"utf-8\"><script>document.open();document.write(new TextDecoder().decode(Uint8Array.from(atob('" + payload + "'),c=>c.charCodeAt(0))));document.close();</script>\n";

    fs.writeFileSync(wrapperPath, wrapper, "utf8");
}

if (process.argv[2] === "extract") {
    extract();
} else if (process.argv[2] === "build") {
    build();
} else {
    fail("Use: node scripts/dashboard-wrapper.js <extract|build>");
}
