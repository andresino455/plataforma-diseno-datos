function generatePom(projectName, basePackage) {
  const artifactId = projectName.toLowerCase();
  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.0</version>
    <relativePath/>
  </parent>

  <groupId>${basePackage}</groupId>
  <artifactId>${artifactId}</artifactId>
  <version>0.0.1-SNAPSHOT</version>
  <name>${projectName}</name>
  <description>Backend generado automáticamente a partir del diagrama de datos</description>

  <properties>
    <java.version>21</java.version>
  </properties>

  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springdoc</groupId>
      <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
      <version>2.5.0</version>
    </dependency>
    <dependency>
      <groupId>org.postgresql</groupId>
      <artifactId>postgresql</artifactId>
      <scope>runtime</scope>
    </dependency>
  </dependencies>

  <build>
    <plugins>
      <plugin>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-maven-plugin</artifactId>
      </plugin>
    </plugins>
  </build>
</project>
`;
}

function generateApplicationProperties(projectName) {
  const dbName = projectName.toLowerCase();
  return `spring.application.name=${projectName}

spring.datasource.url=jdbc:postgresql://localhost:5432/${dbName}
spring.datasource.username=postgres
spring.datasource.password=postgres

spring.jpa.hibernate.ddl-auto=update
spring.jpa.show-sql=true
spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.PostgreSQLDialect

# Documentación OpenAPI disponible en /swagger-ui.html
springdoc.api-docs.path=/api-docs
`;
}

function generateMainClass(projectName, basePackage) {
  const className = projectName.replace(/[^a-zA-Z0-9]/g, "") + "Application";
  return `package ${basePackage};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class ${className} {
    public static void main(String[] args) {
        SpringApplication.run(${className}.class, args);
    }
}
`;
}

module.exports = { generatePom, generateApplicationProperties, generateMainClass };
