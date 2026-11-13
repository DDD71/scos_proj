package com.scos;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class BootstrapTest {
    @Autowired
    private MockMvc mvc;

    @Test
    void healthIsAvailableWithoutDatabaseAndReturnsRequestId() throws Exception {
        mvc.perform(get("/api/actuator/health").header("X-Request-ID", "frontend-request-123"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.components").doesNotExist())
                .andExpect(header().string("X-Request-ID", "frontend-request-123"));
    }

    @Test
    void businessApiIsClosedUntilEnterpriseAuthenticationIsImplemented() throws Exception {
        mvc.perform(get("/api/v1/dashboard/overview"))
                .andExpect(status().isForbidden())
                .andExpect(header().string("X-Request-ID", matchesPattern("[0-9a-f-]{36}")));
    }

    @Test
    void untrustedRequestIdIsReplaced() throws Exception {
        mvc.perform(get("/api/actuator/health").header("X-Request-ID", "untrusted id"))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Request-ID", not(is("untrusted id"))))
                .andExpect(header().string("X-Request-ID", matchesPattern("[0-9a-f-]{36}")));
    }
}
