const fs = require("fs");
const path = require("path");

const { generateEntity } = require("./templates/entity");
const {
  generateRepository,
  generateService,
  generateController,
} = require("./templates/crudLayers");
const {
  generatePom,
  generateApplicationProperties,
  generateMainClass,
} = require("./templates/projectFiles");

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

/**
 * Punto de entrada del generador. Este es el "compilador" diagrama -> backend
 * que menciona el alcance del proyecto: cualquier módulo (editor web, IA por
 * voz, importador de imagen) solo necesita producir un objeto con esta forma
 * para poder generar un backend funcional.
 */
function generateBackend(diagram, outputDir) {
  const { basePackage, projectName, entities, relationships } = diagram;

  if (!basePackage || !projectName) {
    throw new Error("El diagrama debe incluir 'projectName' y 'basePackage'.");
  }

  const entitiesById = Object.fromEntries(entities.map((e) => [e.id, e]));
  const srcRoot = path.join(
    outputDir,
    "src/main/java",
    basePackage.replace(/\./g, "/")
  );

  // Archivos de proyecto
  writeFile(path.join(outputDir, "pom.xml"), generatePom(projectName, basePackage));
  writeFile(
    path.join(outputDir, "src/main/resources/application.properties"),
    generateApplicationProperties(projectName)
  );
  writeFile(
    path.join(srcRoot, `${projectName.replace(/[^a-zA-Z0-9]/g, "")}Application.java`),
    generateMainClass(projectName, basePackage)
  );

  // Por cada entidad del diagrama: Entity + Repository + Service + Controller
  for (const entity of entities) {
    writeFile(
      path.join(srcRoot, "entity", `${entity.name}.java`),
      generateEntity(entity, relationships, entitiesById, basePackage)
    );
    writeFile(
      path.join(srcRoot, "repository", `${entity.name}Repository.java`),
      generateRepository(entity, basePackage)
    );
    writeFile(
      path.join(srcRoot, "service", `${entity.name}Service.java`),
      generateService(entity, basePackage)
    );
    writeFile(
      path.join(srcRoot, "controller", `${entity.name}Controller.java`),
      generateController(entity, basePackage)
    );
  }

  console.log(`✔ Backend generado en: ${outputDir}`);
  console.log(`  Entidades procesadas: ${entities.map((e) => e.name).join(", ")}`);
}

module.exports = { generateBackend };
