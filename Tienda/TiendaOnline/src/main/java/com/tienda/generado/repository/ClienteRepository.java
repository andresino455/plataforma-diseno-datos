package com.tienda.generado.repository;

import com.tienda.generado.entity.Cliente;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.UUID;


@Repository
public interface ClienteRepository extends JpaRepository<Cliente, UUID> {
}
