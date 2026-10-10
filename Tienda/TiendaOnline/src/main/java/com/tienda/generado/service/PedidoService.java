package com.tienda.generado.service;

import com.tienda.generado.entity.Pedido;
import com.tienda.generado.repository.PedidoRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;
import java.util.UUID;


@Service
public class PedidoService {

    @Autowired
    private PedidoRepository repository;

    public List<Pedido> findAll() {
        return repository.findAll();
    }

    public Optional<Pedido> findById(UUID id) {
        return repository.findById(id);
    }

    public Pedido save(Pedido entity) {
        return repository.save(entity);
    }

    public void deleteById(UUID id) {
        repository.deleteById(id);
    }
}
