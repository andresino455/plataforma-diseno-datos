package com.tienda.generado.service;

import com.tienda.generado.entity.Cliente;
import com.tienda.generado.repository.ClienteRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;
import java.util.UUID;


@Service
public class ClienteService {

    @Autowired
    private ClienteRepository repository;

    public List<Cliente> findAll() {
        return repository.findAll();
    }

    public Optional<Cliente> findById(UUID id) {
        return repository.findById(id);
    }

    public Cliente save(Cliente entity) {
        return repository.save(entity);
    }

    public void deleteById(UUID id) {
        repository.deleteById(id);
    }
}
