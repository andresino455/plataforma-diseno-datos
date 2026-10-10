const { mapType, importForType } = require("../typeMapper");

function idInfo(entity) {
  const pk = entity.attributes.find((a) => a.isPrimaryKey);
  return { name: pk.name, javaType: mapType(pk.type) };
}

// Si el tipo del ID necesita un import (ej. UUID, LocalDate), arma la línea;
// si no lo necesita (ej. Long, Integer, String), devuelve string vacío.
function idImportLine(id) {
  const imp = importForType(id.javaType);
  return imp ? `import ${imp};\n` : "";
}

function generateRepository(entity, basePackage) {
  const id = idInfo(entity);
  return `package ${basePackage}.repository;

import ${basePackage}.entity.${entity.name};
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
${idImportLine(id)}

@Repository
public interface ${entity.name}Repository extends JpaRepository<${entity.name}, ${id.javaType}> {
}
`;
}

function generateService(entity, basePackage) {
  const id = idInfo(entity);
  return `package ${basePackage}.service;

import ${basePackage}.entity.${entity.name};
import ${basePackage}.repository.${entity.name}Repository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;
${idImportLine(id)}

@Service
public class ${entity.name}Service {

    @Autowired
    private ${entity.name}Repository repository;

    public List<${entity.name}> findAll() {
        return repository.findAll();
    }

    public Optional<${entity.name}> findById(${id.javaType} id) {
        return repository.findById(id);
    }

    public ${entity.name} save(${entity.name} entity) {
        return repository.save(entity);
    }

    public void deleteById(${id.javaType} id) {
        repository.deleteById(id);
    }
}
`;
}

function generateController(entity, basePackage) {
  const id = idInfo(entity);
  const path = entity.name.toLowerCase() + "s";
  return `package ${basePackage}.controller;

import ${basePackage}.entity.${entity.name};
import ${basePackage}.service.${entity.name}Service;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
${idImportLine(id)}

@RestController
@RequestMapping("/api/${path}")
public class ${entity.name}Controller {

    @Autowired
    private ${entity.name}Service service;

    @GetMapping
    public List<${entity.name}> getAll() {
        return service.findAll();
    }

    @GetMapping("/{id}")
    public ResponseEntity<${entity.name}> getById(@PathVariable ${id.javaType} id) {
        return service.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ${entity.name} create(@RequestBody ${entity.name} entity) {
        return service.save(entity);
    }

    @PutMapping("/{id}")
    public ResponseEntity<${entity.name}> update(@PathVariable ${id.javaType} id, @RequestBody ${entity.name} entity) {
        if (service.findById(id).isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        entity.set${id.name.charAt(0).toUpperCase() + id.name.slice(1)}(id);
        return ResponseEntity.ok(service.save(entity));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable ${id.javaType} id) {
        service.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
`;
}

module.exports = { generateRepository, generateService, generateController };
