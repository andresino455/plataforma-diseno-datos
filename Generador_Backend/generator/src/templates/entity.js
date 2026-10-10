const { mapType, importForType } = require("../typeMapper");

// Busca las relaciones donde esta entidad participa, para agregar los campos
// @OneToMany / @ManyToOne correspondientes.
function relationshipFields(entity, relationships, entitiesById) {
  const fields = [];

  for (const rel of relationships) {
    if (rel.from === entity.id && rel.type === "ONE_TO_MANY") {
      const target = entitiesById[rel.to];
      fields.push({
        annotation: `@OneToMany(mappedBy = "${rel.toRole}", cascade = CascadeType.ALL)`,
        type: `List<${target.name}>`,
        name: rel.fromRole,
        importLine: "java.util.List",
      });
    }
    if (rel.to === entity.id && rel.type === "ONE_TO_MANY") {
      const owner = entitiesById[rel.from];
      fields.push({
        annotation: `@ManyToOne\n    @JoinColumn(name = "${owner.name.toLowerCase()}_id")`,
        type: owner.name,
        name: rel.toRole,
        importLine: null,
      });
    }
  }

  return fields;
}

function generateEntity(entity, relationships, entitiesById, basePackage) {
  const imports = new Set([
    "jakarta.persistence.*",
  ]);

  const fieldLines = [];

  for (const attr of entity.attributes) {
    const javaType = mapType(attr.type);
    const importLine = importForType(javaType);
    if (importLine) imports.add(importLine);

    const annotations = [];
    if (attr.isPrimaryKey) {
      annotations.push("@Id");
      if (javaType === "UUID") {
        annotations.push('@GeneratedValue(strategy = GenerationType.UUID)');
      } else {
        annotations.push("@GeneratedValue(strategy = GenerationType.IDENTITY)");
      }
    } else {
      const columnOpts = [];
      if (attr.unique) columnOpts.push("unique = true");
      if (attr.nullable === false) columnOpts.push("nullable = false");
      if (columnOpts.length) {
        annotations.push(`@Column(${columnOpts.join(", ")})`);
      }
    }

    fieldLines.push(
      `    ${annotations.join("\n    ")}${annotations.length ? "\n    " : "    "}private ${javaType} ${attr.name};`
    );
  }

  const relFields = relationshipFields(entity, relationships, entitiesById);
  for (const rf of relFields) {
    if (rf.importLine) imports.add(rf.importLine);
    fieldLines.push(`    ${rf.annotation}\n    private ${rf.type} ${rf.name};`);
  }

  const importLines = [...imports].map((i) => `import ${i};`).join("\n");

  return `package ${basePackage}.entity;

${importLines}

@Entity
@Table(name = "${entity.name.toLowerCase()}")
public class ${entity.name} {

${fieldLines.join("\n\n")}

    public ${entity.name}() {
    }

    // Getters y setters generados
${entity.attributes
  .map((attr) => {
    const javaType = mapType(attr.type);
    const cap = attr.name.charAt(0).toUpperCase() + attr.name.slice(1);
    return `    public ${javaType} get${cap}() {
        return ${attr.name};
    }

    public void set${cap}(${javaType} ${attr.name}) {
        this.${attr.name} = ${attr.name};
    }`;
  })
  .join("\n\n")}
}
`;
}

module.exports = { generateEntity };
