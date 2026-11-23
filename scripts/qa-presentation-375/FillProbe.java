import com.sun.star.beans.PropertyValue;
import com.sun.star.beans.XPropertySet;
import com.sun.star.comp.helper.Bootstrap;
import com.sun.star.drawing.XDrawPagesSupplier;
import com.sun.star.drawing.XShape;
import com.sun.star.drawing.XShapeDescriptor;
import com.sun.star.drawing.XShapes;
import com.sun.star.frame.XComponentLoader;
import com.sun.star.frame.XDesktop;
import com.sun.star.frame.XStorable;
import com.sun.star.lang.XComponent;
import com.sun.star.task.XInteractionAbort;
import com.sun.star.task.XInteractionContinuation;
import com.sun.star.task.XInteractionHandler;
import com.sun.star.task.XInteractionRequest;
import com.sun.star.text.XText;
import com.sun.star.uno.Any;
import com.sun.star.uno.Type;
import com.sun.star.uno.UnoRuntime;
import com.sun.star.uno.XComponentContext;
import com.sun.star.util.XComplexColor;
import com.sun.star.bridge.XUnoUrlResolver;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.io.PrintWriter;
import java.util.Base64;

/** Diagnostic only: connect to an explicitly owned pipe, never bootstrap Office. */
public final class FillProbe {
    static final class AbortInteractions extends com.sun.star.lib.uno.helper.WeakBase implements XInteractionHandler {
        public void handle(XInteractionRequest request) {
            for (XInteractionContinuation c : request.getContinuations()) {
                XInteractionAbort abort = UnoRuntime.queryInterface(XInteractionAbort.class, c);
                if (abort != null) { abort.select(); return; }
            }
        }
    }
    static PropertyValue prop(String name, Object value) {
        PropertyValue p = new PropertyValue(); p.Name = name; p.Value = value; return p;
    }
    static XComponent load(XComponentLoader loader, Path source, boolean asTemplate) throws Exception {
        XComponent doc = loader.loadComponentFromURL(source.toUri().toASCIIString(), "_blank", 0,
            new PropertyValue[] {prop("Hidden", true), prop("ReadOnly", true), prop("AsTemplate", asTemplate),
                prop("MacroExecutionMode", com.sun.star.document.MacroExecMode.NEVER_EXECUTE),
                prop("UpdateDocMode", com.sun.star.document.UpdateDocMode.NO_UPDATE),
                prop("InteractionHandler", new AbortInteractions())});
        if (doc == null) throw new IllegalStateException("No document loaded");
        return doc;
    }
    static XShapes page(XComponent doc, int index) throws Exception {
        return UnoRuntime.queryInterface(XShapes.class,
            UnoRuntime.queryInterface(XDrawPagesSupplier.class, doc).getDrawPages().getByIndex(index));
    }
    static String text(Object shape) {
        XText t = UnoRuntime.queryInterface(XText.class, shape);
        return t == null ? "" : t.getString();
    }
    static String encoded(String s) {
        return Base64.getEncoder().encodeToString(s.getBytes(StandardCharsets.UTF_8));
    }
    static int fill(XPropertySet props) throws Exception {
        return ((Number)props.getPropertyValue("FillColor")).intValue() & 0xffffff;
    }
    static XComplexColor complex(XPropertySet props) throws Exception {
        return UnoRuntime.queryInterface(XComplexColor.class, props.getPropertyValue("FillComplexColor"));
    }
    static void snapshot(PrintWriter out, String phase, XComponent doc) throws Exception {
        int count = UnoRuntime.queryInterface(XDrawPagesSupplier.class, doc).getDrawPages().getCount();
        if (count != 3) throw new IllegalStateException("Unexpected slide count: " + count);
        for (int p = 0; p < count; p++) {
            XShapes shapes = page(doc, p);
            for (int i = 0; i < shapes.getCount(); i++) {
                Object o = shapes.getByIndex(i);
                XShape s = UnoRuntime.queryInterface(XShape.class, o);
                XPropertySet props = UnoRuntime.queryInterface(XPropertySet.class, o);
                boolean hasFill = props.getPropertySetInfo().hasPropertyByName("FillColor");
                XComplexColor c = props.getPropertySetInfo().hasPropertyByName("FillComplexColor") ? complex(props) : null;
                out.printf("%s\t%d\t%d\t%s\t%s\t%d\t%d\t%d\t%d\t%d\t%d\t%d%n",
                    phase, p, i, UnoRuntime.queryInterface(XShapeDescriptor.class, o).getShapeType(),
                    encoded(text(o)), s.getPosition().X, s.getPosition().Y, s.getSize().Width, s.getSize().Height,
                    hasFill ? fill(props) : -1, c == null ? -1 : c.getType(), c == null ? -1 : c.getThemeColorType());
            }
        }
        out.flush();
    }
    static void export(XComponent doc, Path target) throws Exception {
        if (Files.exists(target)) throw new IllegalStateException("Refuse overwrite: " + target);
        UnoRuntime.queryInterface(XStorable.class, doc).storeToURL(target.toUri().toASCIIString(),
            new PropertyValue[] {prop("FilterName", "Impress MS PowerPoint 2007 XML"), prop("Overwrite", false)});
    }
    public static void main(String[] args) throws Exception {
        if (args.length != 4 || !args[0].matches("p375_[a-f0-9]{32}"))
            throw new IllegalArgumentException("Expected own pipe, source, expectations, output directory");
        Path source = Path.of(args[1]).toAbsolutePath();
        Path output = Path.of(args[3]).toAbsolutePath();
        XComponentContext local = Bootstrap.createInitialComponentContext(null);
        XUnoUrlResolver resolver = UnoRuntime.queryInterface(XUnoUrlResolver.class,
            local.getServiceManager().createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", local));
        XComponentContext remote = null;
        for (int retry = 0; retry < 100 && remote == null; retry++) {
            try { remote = UnoRuntime.queryInterface(XComponentContext.class,
                resolver.resolve("uno:pipe,name=" + args[0] + ";urp;StarOffice.ComponentContext")); }
            catch (com.sun.star.connection.NoConnectException e) { Thread.sleep(100); }
        }
        if (remote == null) throw new IllegalStateException("Own private UNO listener unavailable");
        Object desktop = remote.getServiceManager().createInstanceWithContext("com.sun.star.frame.Desktop", remote);
        XComponentLoader loader = UnoRuntime.queryInterface(XComponentLoader.class, desktop);
        XComponent control = null, diagnostic = null;
        try (PrintWriter out = new PrintWriter(Files.newBufferedWriter(output.resolve("properties.tsv"), StandardCharsets.UTF_8))) {
            try {
                control = load(loader, source, false);
                snapshot(out, "control-before", control);
                export(control, output.resolve("control.pptx"));
                diagnostic = load(loader, source, true); // Separate new in-memory template instance.
                if (UnoRuntime.areSame(control, diagnostic)) throw new IllegalStateException("Document copy was reused");
                snapshot(out, "diagnostic-before", diagnostic);
                int changed = 0;
                for (String line : Files.readAllLines(Path.of(args[2]), StandardCharsets.UTF_8)) {
                    String[] fields = line.split("\t", -1);
                    if (fields.length != 9) throw new IllegalStateException("Invalid source-derived expectation");
                    int index = Integer.parseInt(fields[1]);
                    Object shape = page(diagnostic, 2).getByIndex(index);
                    XShape geometry = UnoRuntime.queryInterface(XShape.class, shape);
                    XPropertySet props = UnoRuntime.queryInterface(XPropertySet.class, shape);
                    if (!text(shape).equals(fields[2]) ||
                        !UnoRuntime.queryInterface(XShapeDescriptor.class, shape).getShapeType().equals("com.sun.star.drawing.RectangleShape") ||
                        geometry.getPosition().X != Integer.parseInt(fields[4]) || geometry.getPosition().Y != Integer.parseInt(fields[5]) ||
                        geometry.getSize().Width != Integer.parseInt(fields[6]) || geometry.getSize().Height != Integer.parseInt(fields[7]) ||
                        fill(props) != Integer.parseInt(fields[3], 16))
                        throw new IllegalStateException("Source shape/RGB association not proven: " + fields[0]);
                    XComplexColor before = complex(props);
                    // Verified runtime source enums: ColorType::Theme = 4, ThemeColorType::Accent1 = 4.
                    if (before == null || before.getType() != 4 || before.getThemeColorType() != 4)
                        throw new IllegalStateException("Expected inherited Accent1 hypothesis not observed: " + fields[0]);
                    props.setPropertyValue("FillComplexColor", new Any(new Type(XComplexColor.class), null));
                    XComplexColor after = complex(props);
                    if ((after != null && after.getThemeColorType() != -1) || fill(props) != Integer.parseInt(fields[3], 16))
                        throw new IllegalStateException("Clearing only complex color did not preserve RGB");
                    changed++;
                }
                if (changed != 2) throw new IllegalStateException("Expected exactly two source-bound rectangles");
                snapshot(out, "diagnostic-after", diagnostic);
                export(diagnostic, output.resolve("cleared-complex-color.pptx"));
            } finally {
                if (diagnostic != null) diagnostic.dispose();
                if (control != null) control.dispose();
                UnoRuntime.queryInterface(XDesktop.class, desktop).terminate();
            }
        }
    }
}
